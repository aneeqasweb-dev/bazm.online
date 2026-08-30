# Phase 3 completion record

Status: complete and verified on 2026-08-29.

## Delivered

- A strict `@bazm/domain` workspace defines all core entity, DTO, projection,
  primitive, pagination, and error contracts.
- Trusted Admin SDK repositories cover all Phase 3 collections and user-owned
  subcollections. Every read is schema-validated; writes add server-managed
  timestamps and a schema version.
- Immutable repository boundaries protect inventory ledger transactions,
  wishlist records, and audit entries. The product read service deliberately
  selects only the public product projection.
- All planned list shapes have fixed limits, opaque document-cursor pagination,
  and matching composite indexes. Offset and unbounded-fetch APIs are absent.
- Historical order item snapshots remain authoritative after catalog changes.
- Retention, archival, snapshot, and forward-only migration procedures are
  documented in [phase-3-persistence.md](./phase-3-persistence.md).

## Verification evidence

`npm run verify` completed successfully. It runs formatting, linting, strict
type checks, unit tests, production builds, index coverage checks, Firestore
and Storage rules tests, Functions health/registration/auth tests, and the
Phase 3 Firestore Emulator persistence flow.

The persistence flow verifies repository CRUD, Firestore server timestamps,
validated public projections, stable cursor pagination, rejection of immutable
ledger updates, and the order-snapshot invariant after product mutation.
