# Phase 19 testing strategy

Date: 2026-08-29

Phase 19 treats the test suite as a release gate, not a loose collection of
checks. The suite must prove that domain boundaries, Firebase rules, callables,
webhook idempotency, browser journeys, accessibility, and production builds stay
deterministic under emulator-only conditions.

## Defect severity

| Severity | Meaning                                                                                                                                                                                    | Release rule                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Critical | Unauthorized data access, payment/refund mutation without valid authority, order/inventory money corruption, production secret exposure, or a customer/admin journey that cannot complete. | Blocks the phase and any release candidate.                         |
| High     | Incorrect totals, coupon/refund double-application, broken auth/session lifecycle, failed checkout/admin state transition, or critical accessibility violation in a core journey.          | Blocks the phase until fixed and regression-tested.                 |
| Medium   | Non-critical a11y issue, non-core UI degradation, recoverable email/reporting issue, or non-blocking pagination/filter regression.                                                         | Must be triaged with owner and target phase.                        |
| Low      | Copy, visual polish, non-core empty-state quality, or documentation mismatch.                                                                                                              | Can ship with explicit follow-up if no higher severity is attached. |

## Regression suite

Run the full local gate before marking a phase complete:

```bash
npm run verify
```

The gate expands to:

```bash
npm run check
DEBUG= npm run test:emulators
```

`npm run check` covers formatting, lint, strict typecheck, unit tests, and the
production build. `npm run test:emulators` rebuilds, verifies Firestore indexes,
runs the rules tests, runs every phase integration flow, runs the Phase 19
reliability gate, and finishes with Playwright E2E/a11y journeys on desktop and
mobile Chromium.

Targeted commands for local diagnosis:

```bash
npm run test --workspace @bazm/domain
npm run test --workspace functions
npm run test --workspace frontend
node tests/phase-19-testing-flow.mjs
npm run test:e2e
```

## Fixture and seed strategy

- All emulator tests use `demo-bazm-online` and generated IDs containing the
  current timestamp or project label.
- Tests must use Firebase Auth, Firestore, Functions, and Storage emulators only.
  No production project, service account, webhook endpoint, or email provider may
  be required for the regression suite.
- Seed data should be explicit in each phase flow unless a shared fixture would
  reduce duplicated setup without hiding test intent.
- Idempotency keys must be deterministic inside a test and unique across tests.
- Tests should assert both the outward result and the trusted persisted state:
  order totals, coupon redemptions, inventory counters, payment/refund status,
  audit logs, and UI visibility.
- Browser tests may use emulator-only test accounts and fake provider IDs; they
  must not store real passwords, card data, tokens, cookies, or customer PII in
  committed fixtures.

## Test report format

CI should publish:

- raw command logs for `npm run check` and `npm run test:emulators`;
- Playwright HTML report at `test-results/playwright-report`;
- Playwright JSON summary at `test-results/playwright-results.json`;
- failure-only screenshots/traces from `test-results/playwright-artifacts`;
- a short summary listing failed command, failed test, severity, owner, and next
  action.

No secrets are allowed in test artifacts. If a failure requires auth context,
the report should reference generated emulator users and document IDs only.

## Keyboard and screen-reader manual scripts

Use these scripts when touching layout, forms, dialogs, authentication,
checkout, reviews, or admin workflows. Automated axe scans must have no critical
violations, and these manual checks cover the flows most likely to break in ways
automation misses.

### Customer registration through delivered review

1. Start emulators and the production Next server with emulator env.
2. Register a new customer, verify email in the emulator, and open `/account`.
3. Using keyboard only, reach profile fields, orders, return actions, support,
   and the delivered-item review form.
4. Submit a review, moderate it as published, then open the product page.
5. Confirm a screen reader announces the page title/heading change, product
   heading, review title, review content, and form status messages.

### Admin product through refund

1. Sign in with an active `SUPER_ADMIN` or permissioned staff account.
2. Using keyboard only, reach the admin module cards, product management,
   returns, payments, and audit navigation.
3. Create or inspect a product with a variant and stocked SKU.
4. Move a delivered return to received, initiate a refund, and process the
   sandbox refund webhook.
5. Confirm status badges, refund IDs, payment refunded amount, and audit entries
   are announced with useful labels and do not expose secrets.

### Empty, slow, and offline states

1. Open `/shop` with a query that returns no products.
2. Confirm the empty state is announced and the filter form remains reachable by
   keyboard.
3. Simulate slow network and repeat the filter journey.
4. Simulate offline navigation from the home page and confirm the current page
   remains usable after the failed navigation.
