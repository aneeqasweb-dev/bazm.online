# Bazm

Bazm is a Pakistan-first fashion e-commerce portfolio platform built with
Next.js, TypeScript, Firebase, and Cloudinary. It demonstrates a complete
storefront and operations workflow while remaining deployable on free tiers.

## Portfolio highlights

- Responsive catalog, filters, product detail, wishlist, cart, and checkout.
- Firebase email/password authentication with verified, server-managed sessions.
- Role-based CUSTOMER, STAFF, ADMIN, and SUPER_ADMIN authorization.
- Product, category, inventory, order, coupon, review, return, and support tools.
- Transaction-safe inventory reservations, order totals, and idempotent actions.
- Cloudinary uploads with signature checks, size limits, ownership boundaries,
  reference-aware cleanup, and responsive image delivery.
- Firebase emulator integration tests plus unit, accessibility, security, and
  production-build checks.

## Free-tier architecture

```text
Browser → Next.js App Router on Vercel
              ├── Firebase Authentication
              ├── Cloud Firestore
              └── Cloudinary image storage/delivery
```

Authenticated Next.js route handlers perform trusted mutations. The historical
Firebase Functions and Storage implementation remains available for emulator
testing and demonstrates the earlier serverless architecture, but the deployed
portfolio does not require Blaze billing.

## Repository layout

```text
frontend/   Next.js application and authenticated server route handlers
functions/  Reusable domain services plus historical Firebase Functions adapters
firebase/   Firestore indexes and deny-by-default security rules
tests/      Cross-workspace and end-to-end tests
docs/       Architecture and development documentation
```

## Requirements

- Node.js 22–24
- npm 11+
- Java 11+ for the Firebase Emulator Suite

## Start the web application

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. Copy `frontend/.env.example` to an ignored
`frontend/.env.local` and configure either the local emulators or a dedicated
staging project. Never commit service-account credentials.

## Run quality checks

```bash
npm run check
```

This runs linting, strict TypeScript checks, unit tests, and production builds
for every workspace.

Use `npm run verify` for the complete gate, including Firestore/Storage Rules and
the Functions health endpoint plus the full Phase 2 authentication matrix against
local Firebase emulators.

## Authentication routes

- `/register` creates a CUSTOMER account and trusted profile.
- `/login` supports persistent email/password sessions; Google appears only when
  explicitly configured.
- `/verify-email`, `/forgot-password`, and `/reset-password` provide safe recovery
  flows.
- `/account` requires an active, verified server session and manages profile,
  Pakistani phone, and avatar data.
- `/admin` is server-guarded by trusted ADMIN/SUPER_ADMIN custom claims.
- `/admin/categories` manages the trusted category hierarchy; active categories
  render at canonical public paths such as `/women/dresses`.

## Start Firebase emulators

```bash
npm run emulators
```

The Emulator Suite UI opens at <http://localhost:4000>. The default
`demo-bazm-online` project ID is local-only and prevents accidental access to a
real Firebase project. Firestore uses port `8081` because port `8080` is occupied
on the current development machine; Auth, Functions, and Storage use `9099`,
`5001`, and `9199` respectively. The command creates an ignored
`functions/.secret.local` file with dummy emulator-only payment and email values
when one does not already exist; it never overwrites an existing local file.

## Staging setup

1. Create separate staging and production Firebase projects.
2. Run `npx firebase-tools@latest use --add` from this directory.
3. Copy `frontend/.env.example` to `frontend/.env.local` and supply the selected
   Firebase web app configuration.
4. Never commit service-account keys or `.env.local`.

The repository includes staging-only, repeat-safe catalog seed commands. They
refuse unknown project IDs and never delete existing records:

```bash
npm run seed:staging
```

## Planning documents

- [Product and brand brief](docs/product-brief.md)
- [System architecture](docs/system-architecture.md)
- [Firestore data model](docs/data-model.md)
- [Security and RBAC](docs/security-rbac.md)
- [Integrations and environment variables](docs/integrations-and-environment.md)
- [Risk register](docs/risk-register.md)
- [MVP scope](docs/mvp-scope.md)
- [Phase 0 completion record](docs/phase-0-completion.md)
- [Phase 1 completion record](docs/phase-1-completion.md)
- [Phase 2 completion record](docs/phase-2-completion.md)
- [Phase 3 completion record](docs/phase-3-completion.md)
- [Phase 4 completion record](docs/phase-4-completion.md)
- [Phase 20 production-preparation record](docs/phase-20-production-preparation.md)
- [Phase 21 deployment record](docs/phase-21-deployment.md)
- [Phase 22 free-tier media migration](docs/phase-22-free-tier-media.md)
- [Portfolio case study](docs/portfolio-case-study.md)
- [Provider readiness](docs/provider-readiness.md)
- [Operations runbook](docs/operations-runbook.md)
- [Data migration and recovery](docs/data-migration-and-recovery.md)
- [Release checklist](docs/release-checklist.md)
