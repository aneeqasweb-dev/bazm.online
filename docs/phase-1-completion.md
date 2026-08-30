# Phase 1 completion record

Date: 2026-08-29

## Implemented foundation

| Area                                 | Evidence                                                                                      |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| Monorepo and strict Next.js frontend | `frontend/`, root npm workspaces, TypeScript and ESLint configs                               |
| Formatting and CI                    | Prettier check plus `.github/workflows/ci.yml` running `npm run verify`                       |
| Safe environment configuration       | Tracked `.env.example`, ignored `.env.local`, Zod validation, clean build without local env   |
| Firebase client and Admin separation | `frontend/src/lib/firebase/` and `functions/src/lib/firebase-admin.ts`                        |
| Emulator routing                     | Auth `9099`, Firestore `8081`, Functions `5001`, Storage `9199`, UI `4000`                    |
| Trusted Functions baseline           | Node.js 22 deployment runtime, structured logging, request IDs, success/error envelopes       |
| Security baseline                    | Deny-by-default Firestore and Storage Rules plus emulator denial tests                        |
| App Check and Analytics              | Lazy browser-only integration; emulator bypass isolated; production App Check config required |
| Continuous verification              | Formatting, lint, strict types, unit tests, builds, Rules tests, and Functions smoke test     |

## Verification evidence

`npm run verify` passed locally on 2026-08-29:

- Prettier formatting check.
- ESLint for frontend, Functions, and Rules tests.
- Strict TypeScript for all three workspaces.
- Nine unit tests across frontend and Functions.
- Next.js optimized production build and Cloud Functions build.
- Auth, Firestore, Functions, and Storage emulators started against the local demo
  project.
- Firestore rejected an unauthenticated product write.
- Storage rejected an unauthenticated product upload.
- The emulated health Function returned HTTP 200 with the expected structured
  response and preserved request correlation ID.
- A separate build with `.env.local` absent passed, demonstrating that CI does not
  depend on untracked local configuration.

## External follow-up

The connected Firebase account has no cloud projects, so no development/staging/
production project was created or deployed. This is intentional and does not block
local Phase 2 authentication work. The GitHub Actions workflow will receive its
first hosted-run evidence after the repository is pushed.

The local machine runs Node.js 24 while deployed Functions are pinned to Firebase's
Node.js 22 runtime. CI runs Node.js 22; local emulator output correctly discloses
the host-runtime difference.
