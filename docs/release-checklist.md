# Production release checklist and approval record

Date: 2026-08-29

## Release checklist

### Build and configuration

- [ ] Release commit/tag and immutable frontend/functions artifacts identified.
- [ ] `npm ci`, `npm run check`, `npm run test:emulators`, high/critical
      dependency audits, and `git diff --check` pass on the release commit.
- [ ] Staging and production `scripts/audit-production-config.mjs` runs pass
      without putting managed secrets in the web build environment.
- [ ] The protected `Release candidate verification` workflow passes and its
      deployed-URL smoke report is attached to this release record.
- [ ] Dedicated project IDs, least-privilege deploy identity, authorized domains,
      environment protection, and release approvers verified.
- [ ] Firestore rules/indexes, Storage Rules, App Check registrations/enforcement,
      function quotas, provider quotas/rate limits, and budget reviewed.

### Providers, policy, and content

- [ ] Every `BLOCKED` row in `docs/provider-readiness.md` is resolved and signed
      by its named owner.
- [ ] Payment/refund live-value webhook, email sender/domain, shipping, tax,
      coupon, returns, analytics consent/property, and custom-domain/DNS tests pass.
- [ ] About, Contact, FAQ, Shipping, Returns, Privacy, and Terms copy receives
      recorded business/legal/privacy/accounting approval as applicable.

### Operations and recovery

- [ ] Terraform plan is peer-reviewed; uptime, error/security alerts, budget,
      notification channels, and backup schedules are applied.
- [ ] Primary and backup responders receive a test alert.
- [ ] Isolated staging restore drill and post-restore authorization/customer/admin
      smoke suites pass with count/reconciliation evidence.
- [ ] Incident roles, launch window, support coverage, provider contacts, status
      communications, go/no-go meeting, and rollback commander are assigned.

### Release and observation

- [ ] Create a fresh verified backup and record its identifier before deploy.
- [ ] Deploy schema-compatible indexes/rules/functions before dependent frontend
      code; verify every step before continuing.
- [ ] Run anonymous, customer, admin, payment/refund, email, SEO, health, and
      unauthorized-operation staging smoke tests, then production read-only smoke.
- [ ] Observe uptime, errors, latency, denials, provider delivery, orders,
      payments, inventory, refunds, and budget for the approved window.
- [ ] Product, platform, operations, finance, support, and legal owners record
      go/no-go approval below.

## Rollback plan

Rollback is triggered by critical/high security failure, sustained unavailability,
payment/order/inventory inconsistency, unauthorized access, unusable checkout, or
an error-rate/latency threshold agreed in the go/no-go review.

1. Incident commander stops rollout and records UTC time/release IDs.
2. Disable the affected write path through the approved feature/provider control
   where safer than accepting more inconsistent work.
3. Redeploy the last known-good immutable frontend and compatible Functions.
   Keep stricter security rules unless the security owner explicitly approves a
   safe compatible rule version; never broaden access to make rollback pass.
4. Roll back configuration/secret versions through their managed systems. DNS
   uses the pre-cutover zone capture and lowered TTL plan.
5. Do not reverse a data migration with deletes. Stop writers and follow
   `docs/data-migration-and-recovery.md` using the tested inverse or an isolated
   restore/promotion decision.
6. Re-run health, authorization, customer/admin, payment/refund, inventory, and
   provider smoke tests. Reconcile all events created during the incident.
7. Continue monitoring and communication until business and technical state
   agree; record follow-up owners before closure.

## Approval record

No approval is inferred from implementation or automated tests.

| Evidence/approval   | Required record                                                    | Current status |
| ------------------- | ------------------------------------------------------------------ | -------------- |
| Release candidate   | Commit/tag, artifact IDs, CI URL, staging URL                      | **PENDING**    |
| Configuration audit | Staging/production run timestamps and reviewer                     | **PENDING**    |
| Provider readiness  | Named payment/email/operations/accounting/privacy owners           | **BLOCKED**    |
| Test alert          | Policy/channel IDs, sent/received UTC timestamps, two responders   | **BLOCKED**    |
| Restore drill       | Backup/restore IDs, counts, duration, tester, reviewer             | **BLOCKED**    |
| Legal/static pages  | Exact release URL/version and named approvers                      | **BLOCKED**    |
| Go/no-go            | Product, platform, operations, finance, support, legal names/times | **BLOCKED**    |

Phase 20 gate remains open until every row is approved and no critical/high
defect or unresolved production blocker remains.
