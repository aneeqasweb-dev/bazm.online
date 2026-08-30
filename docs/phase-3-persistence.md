# Phase 3 persistence design

## Trusted data boundary

`functions/src/data` owns the Admin Firestore repository boundary. Each core
collection has a typed repository using the matching strict domain schema.
Firestore reads are parsed before they reach a service. Repository writes add
the document schema version and Firestore server timestamps; callers cannot
provide either field. Append-only repositories reject updates.

No browser code imports this layer. Direct client access remains deny-by-default
until a later feature phase deliberately opens a constrained rule.

## Bounded list query matrix

Every operational list uses `FirestoreRepository.list`, which requires a
validated one-to-100 page request, appends `limit + 1`, orders by its declared
field plus document ID, and resumes with a verified document cursor. It has no
unbounded `get-all` API and does not accept offsets.

| Query                          | Equality filters               | Stable order                      |
| ------------------------------ | ------------------------------ | --------------------------------- |
| Active users by role           | `isActive`, `role`             | `createdAt` descending            |
| Published products by category | `status`, `categoryId`         | `basePrice.amountMinor` ascending |
| Featured published products    | `status`, `flags.featured`     | `createdAt` descending            |
| Active category children       | `status`, `parentId`           | `sortOrder` ascending             |
| Inventory ledger               | `sku`                          | `createdAt` descending            |
| Customer/admin orders          | `userId`, `status` / `status`  | `placedAt` descending             |
| Customer/order payments        | `userId`, `status` / `orderId` | `createdAt` descending            |
| Product reviews                | `productId`, `status`          | `createdAt` descending            |
| Active coupons                 | `status`                       | `endsAt` ascending                |
| Customer/admin returns         | `userId`, `status` / `status`  | `requestedAt` descending          |
| Customer/admin support tickets | `userId`, `status` / `status`  | `updatedAt` descending            |
| Audit logs                     | `action`                       | `createdAt` descending            |

The corresponding composite indexes are declared in
`firebase/firestore.indexes.json`; the Phase 3 index test makes the definition
set and index file fail together if either changes independently.

## Archive, snapshots, retention, and migration policy

Business records are archived, not hard-deleted. A status transition writes an
`archivedAt` server timestamp; only short-lived carts, expired reservations,
and notifications are eligible for an explicitly configured TTL job. Orders,
payments, refunds, inventory transactions, and audit logs have no automatic
deletion until Pakistani legal/accounting retention periods are approved.

Orders preserve immutable item, price, address, delivery, and policy snapshots.
Catalog, address, or profile changes never rewrite an existing order. The
emulator flow proves this by updating a product after order creation and then
asserting that the stored order name and minor-unit price are unchanged.

Every mutable document includes `schemaVersion`. A migration must be
forward-only, idempotent, cursor-paginated, and run from trusted code. It must
record a correlation ID and counts in an audit log, leave the source document
unchanged when validation fails, and be safe to resume. Production migrations
require a tested export/restore path and approval before execution; no live data
or retention schedule is invented by this repository.
