# Firestore data model

## Conventions

- Document IDs are opaque; public entities also have unique normalized slugs.
- Timestamps are Firestore server timestamps in UTC (`createdAt`, `updatedAt`).
- Money is `{ amountMinor: integer, currency: "PKR" }`; totals are recomputed in
  trusted code.
- Mutable documents carry `schemaVersion`; migrations are idempotent and logged.
- Arrays are bounded metadata only. Growing sets use collections/subcollections.
- All list endpoints are cursor-paginated with an explicit limit (default 24,
  maximum 100) and deterministic tie-breaker.
- Business entities are archived with status/timestamps rather than hard-deleted.

## Collections

| Path                                | Purpose and key fields                                           | Write authority                                 | Retention/index notes                                         |
| ----------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------- |
| `users/{uid}`                       | Profile, role projection, status, preferences                    | Owner-safe fields; trusted role/status          | Account life + legal retention; email/status/admin indexes    |
| `users/{uid}/addresses/{id}`        | Bounded address records                                          | Owner, with server validation at checkout       | Delete on request unless preserved in order snapshot          |
| `products/{id}`                     | Catalog content, slug, status, prices, SEO                       | Admin function                                  | Archive; indexes by category/status/flags/price/date          |
| `products/{id}/variants/{id}`       | SKU, color, size, price override, media                          | Admin function                                  | SKU uniqueness registry; no stock here                        |
| `categories/{id}`                   | Hierarchy, slug, parent, order, SEO                              | Admin function                                  | Archive; parent/status/order index; cycle/depth validation    |
| `inventory/{sku}`                   | Product/variant IDs and available/reserved/sold/returned/damaged | Inventory functions only                        | Permanent ledger projection; transactional access             |
| `inventoryTransactions/{id}`        | SKU delta, type, reason, actor/order, resulting balance          | Inventory functions only                        | Append-only; SKU/date and order/date indexes                  |
| `carts/{uid}`                       | Owner, currency, timestamps                                      | Owner intent; server revalidates                | Short-lived; items in subcollection to avoid growth           |
| `carts/{uid}/items/{variantId}`     | Product/variant reference and requested quantity                 | Owner                                           | Delete after checkout/expiry; never authoritative price       |
| `wishlists/{uid}/items/{productId}` | Saved product and timestamp                                      | Owner                                           | Account life; paginated by timestamp                          |
| `orders/{id}`                       | User, immutable item/address/price snapshots, totals, statuses   | Order functions; constrained admin transitions  | Long-term financial/legal retention; user/status/date indexes |
| `payments/{id}`                     | Order/user/provider refs, amount, status, idempotency metadata   | Payment functions/webhooks                      | Financial retention; never raw card data                      |
| `coupons/{id}`                      | Hashed/normalized code lookup, constraints, counters, status     | Admin/coupon functions                          | Archive; code/status/date indexes                             |
| `couponRedemptions/{id}`            | Coupon, user, order, amount, timestamp                           | Checkout function                               | Append-only; compound uniqueness enforced transactionally     |
| `reviews/{id}`                      | Product/order/user, rating, content, moderation status           | Verified-purchase function; admin moderation    | Archive/redact; product/status/date indexes                   |
| `returns/{id}`                      | Order/items, reason, evidence refs, state, refund ref            | Return functions/admin transitions              | Legal/support retention; user/status/date indexes             |
| `notifications/{uid}/items/{id}`    | Type, safe payload, read state, timestamps                       | Trusted functions; owner read/update-read-state | TTL/archive after configured period                           |
| `supportTickets/{id}`               | Owner, subject, status, assigned staff                           | Owner creation; staff functions                 | Retention policy; user/status/date indexes                    |
| `auditLogs/{id}`                    | Action, actor, target, safe metadata, correlation ID             | Trusted functions only                          | Append-only, restricted read, long retention                  |
| `settings/{key}`                    | Versioned public/private operational settings                    | Admin function                                  | Small named docs; client only sees explicit public projection |
| `skuRegistry/{normalizedSku}`       | Variant identity and owner references                            | Product admin function                          | Prevents duplicate SKU transactionally                        |
| `slugRegistry/{type_slug}`          | Unique slug ownership                                            | Category/product admin function                 | Updated transactionally with source record                    |

## Document limits and snapshots

- Target operational documents below 256 KiB, well under Firestore's hard limit.
- An order stores bounded item snapshots; checkout rejects more than the configured
  maximum cart lines and quantities.
- Images are Storage objects; Firestore stores URL/path, dimensions, type, alt
  text, sort order, and content hash only.
- Orders preserve the exact product name, SKU, variant labels, address, unit
  price, discount allocation, tax, shipping, currency, and policy version used.
  Later catalog/profile edits never rewrite historical orders.

## Retention baseline

Exact statutory periods require Pakistani legal/accounting review. Until then:

- Orders, payments, refunds, inventory transactions, and audit logs: retained and
  access-restricted; no automatic deletion enabled.
- Carts and expired reservations: eligible for TTL after 30 days.
- Notifications: eligible for TTL after 180 days.
- Provider webhook payloads: store only required normalized fields; raw sensitive
  payloads are not retained.
- Account deletion anonymizes non-required profile data while preserving legally
  required order/payment snapshots.
