# Phase 20 production-preparation record

Date: 2026-08-30

## Local verification evidence

Verified on 2026-08-30 in the isolated `demo-bazm-online` emulator project:

- `npm run check` passed formatting, lint, strict type checks, 64 unit tests,
  the production build, the configuration audit, and static Phase 20 checks.
- `npm run test:emulators` passed the complete rules and integration suite for
  Phases 2–20, including 9 deny-by-default rules tests and all security flows.
- All 8 Playwright desktop/mobile journeys passed, including release health,
  legal routes, footer links, analytics consent, customer, and admin journeys.
- The deterministic Firestore emulator export/delete/restore/reconciliation
  rehearsal passed.

These results verify repository behavior locally. They do not substitute for
the staging deployment, cloud backup restore, provider tests, alert receipt, or
named approvals required by the production gate.

## Implemented repository controls

- Production/staging environment allowlists and a value-redacting configuration
  audit, including post-build client-bundle secret boundary checks.
- Firebase Secret Manager declarations for payment webhook signing and the email
  provider API key; no provider secret belongs in `.env` or the client build.
- Guarded emulator setup creates an ignored `.secret.local` containing only
  documented dummy values and never overwrites developer-supplied local values.
- App Check remains required outside emulators and global function instance,
  concurrency, memory, and timeout ceilings limit runaway usage.
- Deploy-ready Terraform JSON for uptime, structured error/security alerting,
  budget thresholds, and daily/weekly Firestore backups.
- A no-cache web health endpoint, runbooks, incident/retention plan, release and
  rollback checklist, data migration plan, and deterministic emulator restore
  rehearsal.
- Explicit analytics consent before collection and all seven required public
  information/legal pages linked from the storefront footer and sitemap.

## External gate status

Repository implementation is ready for verification, but Phase 20 is not yet
approved. Dedicated cloud environments, provider accounts/credentials, DNS and
email-domain ownership, notification channels/test receipt, staging cloud
restore evidence, incident contacts, and business/legal/accounting/privacy
approvals are explicitly blocked in `docs/provider-readiness.md` and
`docs/release-checklist.md`.

Automated checks must not convert those external decisions into a false green
gate. Phase 20 checklist items are marked only where the implementation or an
allowed explicit-blocker checkpoint is proven.
