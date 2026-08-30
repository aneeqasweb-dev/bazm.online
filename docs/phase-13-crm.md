# Phase 13 CRM completion

Phase 13 completed on 2026-08-29. The implementation includes:

- Customer 360 profiles with minimized identity data, addresses, authoritative completed-order spend, wishlist/review/support counts, recent orders, and retained activity.
- Reproducible segments: `NEW` (account at most 30 days old and no completed order), `RETURNING` (at least two completed orders), `ACTIVE` (one completed order in the last 90 days), `INACTIVE`, and `DISABLED`.
- Support ticket creation, customer/staff replies, staff assignment, guarded status transitions, related-order ownership validation, and administrative audit records.
- Consent-gated behavioral activity. Only allowlisted event types and up to ten short string context values are accepted. Credentials, tokens, payment data, free-form PII, IP addresses, and user-agent data are not collected. Behavioral records expire after 90 days; operational support-ticket creation activity expires after 180 days.
- Paginated admin support queue and role-protected Customer 360 pages.
- Customer account support center for creating requests, viewing message history, and replying to open tickets.

## Trust and privacy

All writes use callable functions. Firestore remains deny-by-default for browser access. Ticket ownership and staff permissions are enforced in trusted code. Customer 360 is restricted to `customers.manage`; ticket operations use `support.manage`. Administrators and super administrators inherit all module permissions.

## Verification status

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm run test` — 52 tests passed.
- `npm run build` — passed, including `/admin/customers/[id]` and `/admin/support`.
- `node tests/phase-13-crm-flow.mjs` under the Firebase Emulator Suite — passed Customer 360 totals/segments, customer ticket history, ownership, staff authorization, status transitions, auditing, consent/retention, and pagination.

The Phase 13 gate is complete.
