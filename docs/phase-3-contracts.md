# Phase 3 contract foundation

Status: incorporated into the completed Phase 3 gate on 2026-08-29. The
persistence implementation and its verification record are in
[`phase-3-completion.md`](./phase-3-completion.md).

## Shared contract workspace

`@bazm/domain` is a strict, runtime-validated workspace consumed by both the
Next.js application and Cloud Functions. It defines the canonical contracts for
all Phase 3 collections and subcollections, including product variants,
addresses, coupon redemptions, and uniqueness registries.

- IDs are single Firestore path segments; public slugs and SKUs are normalized.
- Monetary amounts are non-negative integer PKR minor units. Quantities are
  bounded integers.
- Stored timestamps accept Firestore `Timestamp` values or `Date` values only;
  trusted code remains responsible for writing server timestamps.
- Customer intents are `.strict()` schemas and intentionally omit status,
  totals, prices, role, staff notes, payment-provider fields, and moderation
  fields.
- Read contracts have separate public/customer and administrative projections.
- Lists use an explicit one-to-100 limit and a versioned opaque cursor. Offset
  pagination is deliberately not a contract.

The workspace's SDK-agnostic `createFirestoreConverter` parses every read and
write at a repository boundary. The trusted persistence layer binds equivalent
strict converters to Admin SDK repositories and exercises server-timestamp
behavior in the Emulator Suite.

## Integration and verification

The trusted registration, profile, and authorization paths now use the shared
customer and role contracts; the registration form uses the same name/email
primitives. The frontend typecheck first runs `next typegen`, so a clean clone
does not depend on pre-existing generated `LayoutProps` definitions.

`npm run verify` passed after this work: formatting, linting, strict type
checks, 40 unit tests, production builds, Rules tests, Functions health,
registration, and the full Phase 2 authentication matrix against the Firebase
Emulator Suite.
