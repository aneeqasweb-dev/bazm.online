# Phase 22 — Free-tier media migration

Date started: 2026-09-01

## Status

**DEPLOYED — OWNER SETUP PENDING** — the free-tier portfolio is live at
<https://bazm-online-frontend.vercel.app>. The owner must register and verify
their account before administrator access can be assigned.

## Why this phase exists

Cloud Storage for Firebase now requires the Blaze pay-as-you-go plan for new
buckets. Bazm is a portfolio project and must remain deployable without a paid
cloud plan or billing account. Firestore, Firebase Authentication, the Emulator
Suite, and all earlier phase evidence remain valid and are not being removed.

## Free-tier production architecture

- Next.js runs the storefront, admin UI, and trusted route handlers on Vercel.
- Firebase Authentication remains the identity provider.
- Cloud Firestore remains the application database.
- Cloudinary stores and optimizes product, category, review, and avatar images.
- Firebase Storage remains emulator-only so historical security tests and phase
  evidence can continue to run locally.
- Firebase Cloud Functions remain part of the completed implementation history;
  production-facing trusted operations will move behind authenticated Next.js
  server boundaries where required to avoid a Blaze dependency.

## Security and quota controls

- Cloudinary credentials are server-only and never use a `NEXT_PUBLIC_` prefix.
- Every upload endpoint verifies the Firebase session and purpose-specific role.
- JPEG, PNG, and WebP are the only accepted formats.
- Avatars and product images stay below 5 MB; review images stay below 3 MB.
- Uploads use deterministic folders and retain provider asset IDs for cleanup.
- Replaced/deleted assets are removed so the portfolio dataset stays within the
  free allowance.
- The demo dataset is intentionally bounded to roughly 20–30 products.

## Ordered work

1. [x] Create the free Cloudinary account and configure server-only credentials.
2. [x] Add and test the trusted media upload adapter and API contract.
3. [x] Migrate avatar uploads and profile persistence.
4. [x] Migrate product and category media uploads.
5. [x] Migrate review image uploads.
6. [x] Remove Firebase Storage and Functions from the production web client.
7. [x] Verify customer/admin flows and deploy the free-tier configuration.
8. [x] Seed the first bounded demo catalog and add repeat-safe staging seeds.
9. [ ] Complete the owner's verified administrator setup.

## Completion record

Phase: 22 — Free-tier media migration
Status: DEPLOYED — OWNER SETUP PENDING
Completed tasks: Architecture and migration boundary recorded; existing Storage
coupling audited; Firestore rules/indexes verified on staging; Cloudinary
credentials verified with an upload/delete round trip; authenticated,
purpose-aware media endpoint added; file size, MIME, and binary signature checks
added; avatar, category, product, and review uploads migrated; profile writes
moved to a trusted Next.js route; frontend lint, 28 tests, strict typecheck, and
production build passed.
Authentication claim synchronization, registration completion, verification
email, and password-reset requests no longer require deployed Firebase
Functions; they now use authenticated Next.js routes or Firebase Auth's free
client APIs. Cart add/update/remove, move-to-wishlist, and wishlist add/remove
commands now run through a session-protected Next.js command route with the
existing product, variant, inventory, quantity, and snapshot validation. The
existing order, inventory, payment, return, review, and CRM services are now
published as internal workspace modules so the Vercel command route reuses the
same tested transaction logic as the historical Functions layer. Address
creation, idempotent checkout, coupon validation, inventory reservation,
COD/sandbox-card payment attempts, unpaid cancellation, returns, reviews, and
support-ticket creation have been migrated. All admin catalog, inventory,
customer, order, payment, coupon, review, return, support, and settings commands
now use the permission-protected Next.js command route as well. Firebase Storage
and Functions SDKs are no longer initialized by the production web client; the
historical Functions and Storage emulator implementation remains in the repo.
The staging storefront now includes three categories and four published products
with original Cloudinary imagery, variants, and inventory. Both seed versions
are staging-only, additive, and idempotent. The expanded 40-route production
build passed. Replaced category, product, and review images now receive
reference-aware, Bazm-path-restricted Cloudinary cleanup; shared images are
preserved and cleanup failures cannot turn a completed database update into a
misleading failed request.
Remaining tasks: Finish the owner's verified administrator setup. Catalog
expansion is optional for the initial four-product portfolio release.

## Verification checkpoint — 2026-09-05

- Staging Authentication was checked through Firebase Admin and the project
  configuration API. Both returned `CONFIGURATION_NOT_FOUND`; Authentication
  still needs to be initialized and Email/Password enabled in the Firebase console.
- `npm run check` passed: static readiness, formatting, lint, type checking,
  72 existing unit tests, production build, and configuration audit.
- Fixed registration rollback so a failed verification email preserves the
  completed account and creates its session, allowing the existing resend flow.
  Three new regression tests and targeted lint passed; the production build
  includes the fix.
- Playwright smoke checks against the local production build with staging
  configuration passed at desktop (1440px) and mobile (390px) widths: home,
  shop, login, and registration loaded; admin and checkout redirected anonymous
  visitors to login.
- Anonymous requests to registration, authorization, customer/admin commands,
  media upload, and profile update returned HTTP 401.
- These are local build and anonymous-access results. Authenticated staging
  registration, checkout, admin operations, and deployment remain unverified.
  The emulator journey suite was not rerun at this checkpoint.

## Verification checkpoint — 2026-09-13

- Firebase Authentication is initialized. Email/password sign-in is enabled;
  passwordless email-link sign-in remains disabled.
- Restored Vercel access and linked the existing `bazm-online-frontend` project.
  Its preview and production settings now include the Cloudinary credentials,
  Firebase Admin identity, and public web configuration. Local environment files
  and scratch files are excluded from deployment uploads.
- A hosted preview built successfully with all 40 routes. Its health endpoint
  and storefront respond successfully.
- Fixed Cloudinary upload timeouts caused by bundling the SDK: Next.js now loads
  Cloudinary as a native server package. Provider failures return a JSON 503
  response with a retry message. Avatar and catalog uploads passed on Vercel.
- Added the `orders(userId, placedAt DESC)` and
  `supportTickets(userId, updatedAt DESC)` indexes required by account pages,
  plus matching query definitions. Existing indexes include a status filter and
  cannot serve these account queries. The index definition check passed.
- Added `npm run test:staging`. It uses temporary identities, catalog records,
  inventory, orders, and media, then removes its fixtures. It refuses other
  Firebase projects and unrelated web hosts. Preview checks use Vercel's
  deployment protection token only for requests to the known preview host.
- Frontend lint, 33 frontend unit tests, frontend type checking, Functions lint,
  28 Functions unit tests, static readiness, and the Vercel build passed.
- Subsequent browser testing found that auth forms could submit before their
  client handlers were attached. Login, registration, and recovery now use POST;
  submission stays disabled until hydration. Two server-rendering regression
  tests pass, bringing the frontend suite to 35 tests.
- Owner administrator setup awaits registration and email verification before
  the staging bootstrap can grant access.

To repeat the hosted test after authenticating Vercel CLI:

```bash
STAGING_TEST_BASE_URL=https://bazm-online-frontend.vercel.app npm run test:staging
```

This portfolio uses staging Firebase data, COD, and sandbox card attempts.
Live card processing, provider-confirmed refunds, and transactional email
delivery still require real provider integrations; the historical commercial
release gate is separate from the portfolio deployment.

## Published portfolio release — 2026-09-13

- Public URL: <https://bazm-online-frontend.vercel.app>.
- Vercel deployment: `dpl_9cU8WRoTzLivuyQbivcR4nsMFaYi`, built from commit
  `a43bffa` and promoted after build and verification checks.
- All 26 Firestore composite indexes are ready.
- Hosted API checks passed for registration, email verification, sessions,
  authorization denial, avatar/catalog uploads, profile updates, catalog and
  inventory administration, cart/wishlist, COD checkout, idempotency, order
  ownership, fulfillment, reviews, moderation, support, returns, sandbox payment
  attempts, and cancellation releasing inventory.
- Desktop/mobile customer and administrator browser sign-in plus eight admin
  pages passed separately after correcting the browser wait conditions and
  auth-form hydration behavior. The final hosted release also passed auth-form
  checks with JavaScript both disabled and enabled.
- `npm run check` passed before the final auth-form change. Subsequent frontend
  lint/type checks, all 35 frontend tests, and the final Vercel production build
  passed. Together with 14 domain and 28 Functions tests, 77 unit tests passed.
- Temporary QA accounts and products were removed; the catalog remains at four
  products and three categories. Unreferenced test imagery was cleaned up.
- After promotion, all 10 public release smoke paths passed, and the home,
  shop, and registration pages passed desktop/mobile browser checks.
- Owner registration/email verification and the super-admin bootstrap remain
  pending. The emulator suite was not rerun for this release.

## Storefront refresh — 2026-09-15

The public demo now has twelve sample products across three collections and a
cream-and-olive fashion storefront, with photographic hero/category sections,
eight new arrivals, and two-column product grids on phones. The previous
four-product release above remains as historical evidence.

See [storefront refresh notes](storefront-refresh.md) for the current deployment,
image prompts, idempotent seed, and desktop/mobile verification results.
