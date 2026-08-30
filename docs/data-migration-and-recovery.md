# Data migration, backup, and recovery plan

Date: 2026-08-29

## Backup policy

Production uses two Firestore scheduled backups defined in Terraform: daily
backups retained for 14 days and Sunday weekly backups retained for 14 weeks.
The platform owner must verify the schedules and newest successful backup after
apply and before every migration. Point-in-time recovery may be enabled as an
additional control after the owner reviews cost and recovery requirements; it
does not replace independent scheduled backups.

Cloud Storage product/review assets need a separate approved lifecycle and
replication policy in the production bucket. Firebase Auth users, Secret Manager
versions, provider configuration, DNS, monitoring, and Terraform state are not
contained in a Firestore backup and must be recoverable through their respective
controlled exports/IaC/runbooks.

Target objectives pending business approval: recovery point objective no more
than 24 hours for catalogue/account/order metadata and recovery time objective
four hours for a declared production data incident. Payment reconciliation can
require provider records and therefore has a separate finance sign-off.

## Restore drill

`node tests/phase-20-production-readiness.mjs` performs a deterministic emulator
logical export/delete/restore comparison and refuses to run against a non-demo
project. This proves serialization and the operator sequence without touching
customer data.

The staging cloud rehearsal remains mandatory before launch:

1. Record the selected backup resource, source database, create time, expected
   document counts, approver, and a new empty restore database ID.
2. Restore into the new staging database/project. Never overwrite the active
   production database to test recovery.
3. Apply the matching rules and indexes, then run schema validation and bounded
   counts for users, products, variants, inventory, orders, payments, refunds,
   coupons, returns, reviews, settings, audit logs, and slug registry.
4. Run unauthorized-operation tests plus customer/admin smoke journeys against
   the isolated restore. Reconcile order/payment/inventory totals and sample
   timestamp/reference integrity.
5. Delete the isolated drill environment only after evidence is approved under
   the normal environment-retirement process. Record duration and lessons.

The gate is blocked until the staging restore ID, timestamps, counts, tester,
and approver are entered in `docs/release-checklist.md`.

## Data migration plan

No production migration is currently pending. Every future schema migration
must be additive and resumable first, with the following release record:

1. Define source/target schema versions, affected collections, invariants,
   volume estimate, index needs, compatibility window, owner, and rollback
   boundary.
2. Add parsers that can read both versions; deploy compatible code before the
   backfill. Rules must remain fail-closed for malformed documents.
3. Create and verify a current backup, export aggregate counts, and run the
   migration against emulator fixtures and an isolated staging copy.
4. Use bounded pages, deterministic IDs/idempotency keys, dry-run counts,
   structured progress logs, retry limits, and a checkpoint cursor. Never log
   document bodies or personal data.
5. Pause if validation error rate, function errors, latency, cost, or customer
   invariants cross the reviewed threshold.
6. Validate counts, money totals, references, inventory equations, payment/order
   states, coupon redemptions, and unauthorized access after every batch.
7. Keep dual-read compatibility through the monitoring window. A rollback stops
   writers and returns application traffic to the last compatible release; data
   reversal uses an explicitly tested inverse migration or isolated restore,
   never ad-hoc deletion.
8. Remove legacy readers/fields only in a later approved release after backup
   retention covers the migration and the rollback window closes.

## Recovery authority

Only the incident commander may declare a restore. A platform operator executes
it; a second operator reviews target/project/database IDs before any command;
finance validates payments/refunds; the product owner validates customer-facing
state. Production overwrite or deletion always requires a separate explicit
approval and is not part of an ordinary drill.
