# Phase 12 admin panel

The admin panel lives under `/admin` and is protected by a server-verified
session cookie. Customers are redirected to `/unauthorized`; STAFF users must
carry the permission required by the module; ADMIN and SUPER_ADMIN users bypass
module-specific permission checks.

## Permission matrix

| Module                  | Route                                  | Permission         |
| ----------------------- | -------------------------------------- | ------------------ |
| Overview metrics        | `/admin`                               | `reports.view`     |
| Products and categories | `/admin/products`, `/admin/categories` | `catalog.manage`   |
| Inventory ledger        | `/admin/inventory`                     | `inventory.manage` |
| Orders                  | `/admin/orders`                        | `orders.manage`    |
| Customers and staff     | `/admin/customers`                     | `customers.manage` |
| Payments and refunds    | `/admin/payments`                      | `payments.manage`  |
| Coupons                 | `/admin/coupons`                       | `coupons.manage`   |
| Reviews                 | `/admin/reviews`                       | `reviews.manage`   |
| Returns                 | `/admin/returns`                       | `returns.manage`   |
| Reports                 | `/admin/reports`                       | `reports.view`     |
| Settings                | `/admin/settings`                      | `settings.manage`  |
| Audit logs              | `/admin/audit`                         | `audit.view`       |

`admin.access` is a broad emergency/admin-ops permission for STAFF accounts and
should be granted sparingly.

## Trusted mutations

The UI does not write commerce collections directly. Every sensitive action uses
Firebase Callable Functions:

- catalog: create/update/publish/archive products and categories
- inventory: receive, adjust, return, damage, reservation finalization/cleanup
- orders: status transitions and tracking updates
- payments: refund initiation
- customers: role, active state, and STAFF permission changes
- coupons: create, activate, expire, archive
- reviews: publish, reject, hide, and rating-summary recalculation
- returns: approve, reject, receive, refund, close
- settings: JSON upsert with expected-revision conflict detection

Risky actions show confirmation in the UI and write immutable audit logs.

## Dashboard/report metric definitions

Metrics are intentionally bounded for the MVP admin panel. The server reads the
latest 200 documents per collection and computes:

- Net revenue: paid payment amount minus recorded refunded amount.
- Orders: count of recently placed orders.
- Customers: count of recent users with role `CUSTOMER`.
- Products: count of recent products plus published subset.
- Stock alerts: inventory rows where available stock is zero or at/below reorder
  point.
- Open returns: returns in `REQUESTED`, `APPROVED`, or `RECEIVED`.
- 7-day revenue/order charts: grouped by `Asia/Karachi`; currency is PKR.

When production order volume grows beyond MVP bounds, replace bounded reads with
scheduled aggregate documents so dashboards stay fast and inexpensive.

## Settings versioning

Settings documents include a `revision` counter. The settings screen sends the
current revision as `expectedRevision`; the backend rejects stale saves and asks
the operator to refresh. This prevents accidental overwrites when two operators
edit the same settings document.

Suggested initial keys:

- `commerce.tax`
- `commerce.shipping`
- `commerce.returns`
- `payments.provider`
- `email.sender`
- `analytics.consent`

## Staging administrator bootstrap

After Firebase Authentication is enabled, register and verify one account
through the application. Bootstrap that first administrator with:

```bash
npm run admin:bootstrap:staging -- --email user@example.com --confirm-super-admin
```

The command refuses non-staging projects, requires an existing verified account
and Firestore profile, refuses to replace a different existing super admin,
writes an audit record, and revokes old sessions after updating claims. All
later role changes must use the audited admin interface.
