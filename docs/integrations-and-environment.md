# Integrations and environment variables

## Provider decisions

| Capability          | MVP strategy                                                                   | Selection gate                                                             | Fallback                                             |
| ------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------- |
| Payments            | `PaymentService` adapter; provider TBD after Pakistani merchant/sandbox review | Merchant eligibility, PKR, webhook signatures, refunds, settlement, fees   | Mock adapter locally; optional policy-controlled COD |
| Transactional email | `EmailService` adapter; provider TBD                                           | Verified domain, Pakistan delivery, templates, suppression/webhooks, price | Emulator/log sink locally; queue/retry in cloud      |
| Shipping            | Configurable zone/weight quote adapter, then courier API if eligible           | Service areas, COD/remittance, tracking, returns, SLA                      | Versioned flat-rate table                            |
| Analytics           | Firebase/Google Analytics consent-aware events                                 | Privacy notice and measurement IDs                                         | Disabled safely when unconfigured                    |
| Search              | Firestore-compatible bounded tokens                                            | Replace when relevance/scale metrics fail thresholds                       | External search adapter later                        |

Provider secrets exist only in Firebase/Google Secret Manager and are referenced
by Cloud Functions. Webhooks verify signatures, timestamp tolerance, event IDs,
amount, currency, order ownership, and idempotency before state changes.

## Environment inventory

| Variable                                    | Exposure | Required             | Purpose                           |
| ------------------------------------------- | -------- | -------------------- | --------------------------------- |
| `NEXT_PUBLIC_APP_URL`                       | Browser  | Production           | Canonical application origin      |
| `NEXT_PUBLIC_FIREBASE_API_KEY`              | Browser  | Firebase client      | Firebase web app identifier       |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`          | Browser  | Firebase client      | Auth domain                       |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID`           | Browser  | Firebase client      | Project identity                  |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`       | Browser  | Firebase client      | Storage bucket identity           |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`  | Browser  | Firebase client      | Messaging sender identity         |
| `NEXT_PUBLIC_FIREBASE_APP_ID`               | Browser  | Firebase client      | Firebase web app identity         |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`       | Browser  | Analytics only       | Analytics stream identity         |
| `NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY` | Browser  | Production App Check | Public App Check site key         |
| `NEXT_PUBLIC_APP_URL`                       | Browser  | Production           | Email-action continuation origin  |
| `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH`            | Browser  | Optional Google auth | Provider UI/configuration switch  |
| `NEXT_PUBLIC_USE_FIREBASE_EMULATORS`        | Browser  | Local only           | Explicit emulator routing switch  |
| `PAYMENT_PROVIDER`                          | Server   | Payments             | Select registered payment adapter |
| `PAYMENT_SECRET_KEY`                        | Secret   | Real payments        | Provider credential               |
| `PAYMENT_WEBHOOK_SECRET`                    | Secret   | Real payments        | Webhook verification              |
| `EMAIL_PROVIDER`                            | Server   | Email                | Select registered email adapter   |
| `EMAIL_API_KEY`                             | Secret   | Real email           | Provider credential               |
| `EMAIL_FROM_ADDRESS`                        | Server   | Real email           | Verified sender                   |
| `APP_BASE_URL`                              | Server   | Cloud environments   | Trusted redirect/link origin      |

Firebase Admin uses Application Default Credentials in managed Functions and the
emulator. No service-account JSON variable or key file is part of the application
contract.

Google sign-in remains hidden and fails closed unless
`NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=true`. Before enabling it, the Google provider and
authorized domains must be configured in Firebase Authentication. Verification
and password-reset templates must use the deployed `/verify-email` and
`/reset-password` action handlers when a real Firebase project is prepared.

## Fail-safe policy

- Local emulator mode is explicit and never inferred from missing credentials.
- Production startup fails validation if required project/App Check/provider
  configuration is absent; it never silently falls back to emulators or mocks.
- Analytics is optional and remains disabled when consent/configuration is absent.
- Secret values are never written to `.env.example`, logs, test snapshots, or Git.
