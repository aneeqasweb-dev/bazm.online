# Phase 21 deployment record

Date: 2026-08-30

## Status

**BLOCKED** — deployment has not started because the Phase 20 production gate
is open and no approved release candidate or deployment targets exist.

## Ready repository controls

- `.github/workflows/release-candidate.yml` provides protected staging and
  production verification with environment-scoped non-secret variables.
- `npm run verify` runs the complete quality, emulator, security, E2E, and
  Phase 20 restore-rehearsal gates.
- `scripts/audit-production-config.mjs` validates environment allowlists and
  secret boundaries without printing values.
- `scripts/smoke-release-url.mjs` checks HTTPS health, legal/static routes,
  security headers, robots, sitemap, and obvious secret exposure.
- `firebase.json` defines Functions, Firestore rules/indexes, and Storage Rules
  as repeatable deployment inputs with Functions predeploy checks.
- The release checklist defines deployment order, observation, rollback
  thresholds, and recovery steps.

## Required unblock evidence

Deployment may begin only after all of the following are recorded:

1. Phase 20 gate approval, including provider, monitoring, restore, incident
   contact, and legal/business evidence.
2. An approved frontend hosting target and dedicated staging/production Firebase
   project IDs with least-privilege deployment identities.
3. A release commit/tag and immutable artifact identifiers. This workspace's
   `main` branch currently has no commits, so no traceable release exists.
4. Protected environment variables, managed secrets, staging URL, authorized
   domains, App Check registrations, and provider callback URLs.
5. Named release approvers and a rollback commander.

## Deployment sequence after approval

1. Run the protected release-candidate workflow for staging and retain its
   audit, verification, and URL-smoke artifacts.
2. Confirm migrations and indexes are compatible and ready before allowing
   dependent traffic.
3. Deploy Firestore indexes/rules, Storage Rules, Functions, and the frontend
   from the same approved release artifact.
4. Run staging authorization, customer/admin, payment/refund, email, analytics,
   SEO, performance, and health checks.
5. Obtain go/no-go approval, create and record a fresh backup, then deploy the
   identical approved artifact/configuration pattern to production.
6. Run post-deploy smoke checks and observe the approved monitoring window;
   execute the documented rollback when a threshold is breached.

## Completion record

Phase: 21 — Deployment
Status: BLOCKED
Completed tasks: Deployment prerequisites and repository controls audited;
local Phase 20 verification and emulator restore rehearsal passed.
Files created/changed: `docs/phase-21-deployment.md`
Architecture decisions: No hosting provider or production topology was inferred
without owner approval.
Commands and results: `npm run check` passed; `npm run test:emulators` passed;
Phase 20 readiness and restore rehearsal passed.
Manual QA evidence: 8 desktop/mobile Playwright journeys passed locally.
Security/rules evidence: 9 deny-by-default rules tests and Phase 18 security flow
passed locally.
Known limitations or blockers: Phase 20 gate, cloud/provider configuration,
release identity, frontend hosting selection, and named approvals are absent.
Remaining tasks: Every Phase 21 deployment and production observation item.
Reviewer/date: Pending.
