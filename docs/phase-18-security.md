# Phase 18 security audit

Date: 2026-08-29

## Threat model update

Phase 18 treats Firebase Auth custom claims, Firestore/Storage Rules, trusted
Cloud Functions, payment webhooks, session cookies, and browser security headers
as the main trust boundaries.

| Area                      | Threat                                                                      | Phase 18 control                                                                                                                                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity and claims       | Stale or missing custom claims continue to authorize privileged work        | Functions, server route authorization, session creation, Firestore Rules, and Storage Rules now require `claimsVersion: 1`; `synchronizeAuthorization` remains the only callable allowed to refresh claims.                                 |
| Disabled accounts         | Old ID tokens continue to mutate data after an account is disabled          | The shared callable guard now checks the trusted `users/{uid}.isActive` profile on each protected callable in addition to token claims.                                                                                                     |
| Direct client data access | Browser SDK reads or writes trusted business collections directly           | Firestore remains deny-by-default except active owner profile reads/updates and active current-claim admin profile reads. Expanded rules tests cover anonymous, owner, other customer, staff, admin, disabled admin, and stale-claim users. |
| Uploads                   | Users upload unexpected file types/sizes or write another user's media path | Storage Rules now require active current claims for owner/admin writes and retain type/size/path constraints.                                                                                                                               |
| Browser attack surface    | XSS, clickjacking, referrer leakage, browser capability abuse               | Global CSP, frame denial, MIME sniffing protection, HSTS, referrer policy, COOP, CORP, and permissions policy are configured in `next.config.ts`. JSON-LD remains the only allowed `dangerouslySetInnerHTML` sink and escapes `<`.          |
| CSRF/session fixation     | Cross-origin site creates/deletes app sessions                              | Session API keeps trusted-origin checks, HttpOnly SameSite cookies, production Secure cookies, `Priority=High`, and private no-store headers.                                                                                               |
| Payment/refund webhooks   | Forged or replayed events alter orders, payments, inventory, or refunds     | Raw-body HMAC verification uses `timingSafeEqual`; event IDs are idempotency keys; payment events reject stale timestamps, amount mismatch, and currency mismatch; refund webhooks are replay-guarded.                                      |
| Audit and logs            | Logs expose credentials, tokens, card data, or unnecessary PII              | Refund initiation/completion now write safe `PAYMENT` audit events; webhook rejection logs are structured and contain only reason/webhook labels. The Phase 18 gate scans audit metadata for sensitive fields.                              |
| Dependencies/secrets      | Known high-risk advisory or committed secret reaches production             | `npm audit --audit-level=high` and `npm audit --omit=dev --audit-level=high` pass. Static secret scanning covers source, docs, rules, and tests.                                                                                            |

## Findings fixed

1. `claimsVersion` existed but was not enforced everywhere. It is now checked by
   callable guards, private route authorization, session creation, Firestore
   Rules, Storage Rules, and admin-module UI filtering.
2. Protected callables trusted token `isActive`; a disabled profile could still
   be represented by an old ID token until refresh. The shared callable guard
   now verifies the current trusted profile state before allowing mutations.
3. Global browser security headers were missing. A CSP-compatible Next/Firebase
   header set now applies to all routes.
4. Refunds had incomplete audit coverage. Direct refund initiation and refund
   completion now write safe `PAYMENT` audit records.
5. Webhook rejection paths did not emit structured security logs. Invalid
   method/signature/payload cases now log safe structured warnings without raw
   payloads or headers.

## Verification commands

Run the fast static Phase 18 scan:

```bash
node tests/phase-18-security-flow.mjs --static-only
```

Run the focused Phase 18 emulator gate after building:

```bash
npm run build
CHOKIDAR_USEPOLLING=true CHOKIDAR_INTERVAL=500 npx --yes firebase-tools@latest emulators:exec --project demo-bazm-online --only auth,firestore,functions,storage "npm run test --workspace @bazm/rules-tests && node tests/phase-18-security-flow.mjs"
```

Run dependency/security scans:

```bash
npm audit --audit-level=high
npm audit --omit=dev --audit-level=high
```

Run the full regression suite:

```bash
DEBUG= npm run test:emulators
```

## Dependency audit note

Both high/critical audit commands pass. `npm audit` currently reports moderate
transitive `uuid` advisories through Google/Firebase dependencies; npm only
offers a forced breaking downgrade of `firebase-admin`, so no high/critical
production issue is carried forward from Phase 18.

## Phase 18 gate evidence

The Phase 18 emulator gate verifies:

- stale customer/admin tokens fail closed;
- disabled profiles fail closed even with an old otherwise-active ID token;
- non-super-admins cannot grant administrator roles;
- public password-reset requests avoid account enumeration;
- web sessions reject cross-origin requests and stale custom claims;
- rendered app responses include the expected security headers and CSP;
- forged/tampered/replayed payment and refund webhooks cannot alter state;
- audit metadata excludes passwords, tokens, cookies, secrets, card data,
  emails, phone numbers, and address fields.
