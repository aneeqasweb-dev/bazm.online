# Bazm

Bazm is a Pakistan-first fashion e-commerce platform built with Next.js and
Firebase. The repository is organized as a monorepo so frontend, trusted
backend code, Firebase policy, tests, and documentation can evolve independently.

## Repository layout

```text
frontend/   Next.js App Router application
functions/  Firebase Cloud Functions (TypeScript, Node.js 22 runtime)
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

Open <http://localhost:3000>. The local environment file is configured for the
Firebase demo project and contains no production credentials.

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

## Connect a real Firebase project later

1. Create separate development, staging, and production Firebase projects.
2. Run `npx firebase-tools@latest use --add` from this directory.
3. Copy `frontend/.env.example` to `frontend/.env.local` and supply the selected
   Firebase web app configuration.
4. Never commit service-account keys or `.env.local`.

No cloud project is created or deployed by the initial setup.

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
- [Provider readiness](docs/provider-readiness.md)
- [Operations runbook](docs/operations-runbook.md)
- [Data migration and recovery](docs/data-migration-and-recovery.md)
- [Release checklist](docs/release-checklist.md)
