# Production operations runbook

Date: 2026-08-29

## Monitoring baseline

Cloud Functions emit structured event names and safe request/correlation IDs;
raw credentials, tokens, webhook bodies, card data, and customer addresses must
never be added to logs. `ops/terraform/production-readiness.tf.json` defines:

- a five-minute HTTPS/TLS uptime check for `/api/health`;
- a critical multi-location availability alert;
- a high-severity alert for any unhandled function error;
- a high-severity alert for a payment-webhook rejection spike;
- monthly cost thresholds at 50%, 80%, 100%, and forecasted 100%;
- daily 14-day and weekly 14-week Firestore backup schedules.

App Check metrics, Cloud Functions invocation/error/latency, Firestore
reads/writes/denials, Storage traffic/denials, email delivery failures, payment
state, inventory reservation expiry, and budget trend are reviewed on every
release and weekly during ordinary operation. Provider dashboards remain the
source of truth for external delivery attempts.

## Alert response

1. Acknowledge the alert and open an incident record with UTC start time,
   severity, affected environment, reporter, and incident commander.
2. Confirm customer impact from at least two independent signals. Do not assume
   a single dashboard is correct.
3. Record the release ID and recent configuration/secret/provider changes.
4. Preserve request IDs, event IDs, safe log links, and aggregate counts. Never
   paste secret values or personal data into chat or tickets.
5. Contain the failure: pause a rollout, disable a feature flag, reduce provider
   traffic, or execute the rollback plan as appropriate.
6. Verify orders, payments, inventory, coupon redemption, email, returns, and
   refunds for partial or duplicate work before replaying anything.
7. Update stakeholders at the severity cadence and close only after monitoring
   and business reconciliation agree.
8. Complete a blameless review for every critical/high incident and track
   corrective actions to owners and dates.

Severity/cadence: critical customer-wide checkout, data, or security impact is
acknowledged within 15 minutes and updated every 30 minutes; high partial or
material degradation within 30 minutes and hourly; medium within one business
day; low through the ordinary backlog.

## Test alert procedure

After Terraform apply, temporarily set the webhook-rejection alert threshold to
zero in a reviewed staging-only plan or use Cloud Monitoring's notification
channel test facility. Confirm both primary and backup responders receive it,
record UTC timestamps and channel IDs in the approval record, then restore the
reviewed threshold. Never generate fake payment events in production. Until
receipt is recorded, Phase 20 monitoring approval remains blocked.

## Payment incident

1. Disable new payment initiation through the approved feature flag/provider
   control if charges or callbacks appear unsafe; keep order history readable.
2. Compare provider event IDs with `paymentWebhookEvents`, payments, refunds,
   orders, inventory reservations, and audit logs.
3. Never replay an event only because the provider says delivery failed. First
   prove the event ID is absent and the target state is eligible.
4. Rotate `PAYMENT_WEBHOOK_SECRET` only with a coordinated dual-secret/provider
   plan; deploy affected functions and validate signatures before retiring the
   prior version.
5. Reconcile captured/refunded totals with finance before resolution.

## Email incident

Keep provider API keys in Secret Manager. Inspect aggregate delivery states and
safe provider message IDs. Retry only pending/failed idempotent records through
the admin retry action. If the sending domain or provider is compromised, stop
delivery, rotate `EMAIL_PROVIDER_API_KEY`, validate SPF/DKIM/DMARC and sender,
then resume a bounded batch.

## Availability and release incident

Check DNS/TLS, hosting status, `/api/health`, Firebase service health, function
error rates, and the release ID. If the incident began with a release and no
forward fix is safer within 15 minutes, execute `docs/release-checklist.md`'s
rollback plan. A frontend rollback must be paired with compatible Functions,
rules, indexes, and schema; never roll security rules back to a broader policy.

## Incident contacts

The following roles must be filled in the private on-call system before launch;
personal addresses and phone numbers do not belong in Git.

| Role                                | Required coverage                              | Status                                                 |
| ----------------------------------- | ---------------------------------------------- | ------------------------------------------------------ |
| Incident commander/platform primary | 24×7 launch-window acknowledgement             | **BLOCKED — assignee and notification channel absent** |
| Platform backup                     | Independent channel and deploy/rollback access | **BLOCKED — assignee and notification channel absent** |
| Payment/finance owner               | Provider console and reconciliation authority  | **BLOCKED — assignee absent**                          |
| Customer support lead               | Status messaging and ticket coordination       | **BLOCKED — assignee absent**                          |
| Privacy/security contact            | Breach assessment and escalation               | **BLOCKED — assignee absent**                          |

## Retention and access

- Operational application logs: target 30 days unless investigation/legal needs
  require an approved exception; redact at source rather than relying on expiry.
- Security/audit records: target 400 days with least-privilege access and
  immutable export where the approved compliance plan requires it.
- Firestore backups: daily for 14 days and weekly for 14 weeks as encoded in
  Terraform; production owners must confirm cost and jurisdiction.
- CI reports: 14 days, no `.env`, Terraform state, tokens, or emulator customer
  fixtures.
- Incident records: retain according to the approved legal/security schedule.

Any retention change requires privacy/security review, a cost check, and an
updated approval record.
