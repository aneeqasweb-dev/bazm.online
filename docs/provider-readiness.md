# Phase 20 provider readiness

Date: 2026-08-29

This document is the explicit production-provider sign-off record. `BLOCKED`
means the code boundary exists but an accountable business/provider owner has
not supplied or approved the external production configuration. A blocked row
is a release blocker, not an implementation failure.

## Readiness matrix

| Area                  | Repository readiness                                                                                                                                       | External status                                                                                                                      | Owner/action required                                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Firebase environments | Emulator isolation, App Check initialization, rules, indexes, Storage policy, config audit, and bounded function defaults exist                            | **BLOCKED** — dedicated staging/production projects and release identities are not connected                                         | Platform owner creates projects, least-privilege deploy identities, authorized domains, quotas, and App Check registrations                            |
| Payment/refund        | Raw-body HMAC validation, constant-time comparison, replay protection, idempotent state changes, and Secret Manager declaration exist                      | **BLOCKED** — production payment provider, merchant approval, webhook URL, event schema, and managed secret are absent               | Finance/provider owner selects the adapter, completes KYC, registers both webhooks, sets `PAYMENT_WEBHOOK_SECRET`, and signs live-value smoke evidence |
| Transactional email   | HTTP provider adapter, retry queue, idempotency, templates, sender config, and Secret Manager declaration exist                                            | **BLOCKED** — provider account, API key, sending-domain DNS, and sender reputation checks are absent                                 | Communications owner verifies SPF/DKIM/DMARC, sets `EMAIL_PROVIDER_API_KEY`, and signs delivery/bounce tests                                           |
| Shipping              | Standard/express model and address validation exist                                                                                                        | **BLOCKED** — courier contracts, serviceable areas, charges, SLAs, reverse shipping, and tracking integration are not approved       | Operations owner replaces mock flat rates with approved versioned `commerce.shipping` values/provider adapter                                          |
| Tax/invoices          | PKR money model and tax snapshot fields exist; checkout currently treats displayed prices as tax-inclusive with zero separately calculated tax             | **BLOCKED** — legal entity, registration status, tax treatment, and invoice wording lack accountant approval                         | Accountant and product owner approve versioned `commerce.tax` settings and invoice content                                                             |
| Coupons               | Limits, windows, minimum order, maximum discount, normalized codes, transaction-safe redemption, and admin controls exist                                  | **BLOCKED** — launch campaigns and commercial approval are absent                                                                    | Merchandising owner creates only approved, time-bounded production coupons and verifies caps                                                           |
| Returns/refunds       | Versioned policy, 14-day baseline, eligibility, evidence, inspection, stock outcome, partial refund, and audit flows exist                                 | **BLOCKED** — hygiene exclusions, reverse-shipping fees, final-sale categories, and final legal wording are not approved             | Legal/operations owners approve `commerce.returns` and public copy before activation                                                                   |
| Analytics consent     | Analytics stays disabled until explicit browser consent; choice is persistent and reversible                                                               | **BLOCKED** — production measurement property, retention settings, data-processing approval, and consent-category wording are absent | Privacy/marketing owners configure the property and approve the privacy notice; platform owner supplies only the public measurement ID                 |
| Custom domain and DNS | Canonical URLs default to `https://bazm.online`; health endpoint, TLS uptime configuration, robots, sitemap, and DNS cutover/rollback steps are documented | **BLOCKED** — hosting target, registrar/DNS access, verified domain, and TLS certificate are absent                                  | Platform owner selects hosting in Phase 21, verifies ownership, lowers TTL, captures existing records, and schedules cutover                           |
| Legal/static content  | About, Contact, FAQ, Shipping, Returns, Privacy, and Terms routes are implemented and linked from every storefront footer                                  | **BLOCKED** — business, accountant, privacy, and legal approval has not been recorded                                                | Named approvers review exact deployed release-candidate copy and sign the release checklist                                                            |

## Required production variables

Public web configuration is restricted to the allowlist in
`frontend/.env.example`. Non-secret function configuration is restricted to
`functions/.env.example`. The only provider credentials currently recognized by
the application are `PAYMENT_WEBHOOK_SECRET` and `EMAIL_PROVIDER_API_KEY`; both
are declared with `defineSecret` and must be created with Firebase Secret
Manager. They must not be placed in GitHub variables, `.env` files, the web
build environment, logs, or Terraform state.

Run the real environment audit without printing values:

```bash
node scripts/audit-production-config.mjs --environment staging
node scripts/audit-production-config.mjs --environment production
```

## Custom domain/DNS plan

1. Select the Phase 21 hosting target and obtain its ownership, A/AAAA/CNAME,
   and certificate requirements.
2. Export the current DNS zone and record TTLs; store the export in the
   restricted operations vault, not this repository.
3. Add provider verification records without changing traffic. Validate SPF,
   DKIM, and DMARC independently from the web cutover.
4. Lower the affected web-record TTL at least one prior TTL window before
   cutover, then deploy and smoke-test the provider hostname.
5. Change `bazm.online`/`www` traffic, verify TLS, `/api/health`, canonical tags,
   authentication authorized domains, webhooks, email links, and App Check.
6. Roll back to the captured records if critical smoke tests fail. Restore the
   ordinary TTL after the monitoring window.
