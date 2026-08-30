# Transactional email

Phase 11 keeps all transactional email behind trusted Cloud Functions. The browser can request account emails, but it never talks to an email vendor and never receives provider credentials.

## Delivery model

- `EmailService` renders a typed template, creates one `emailDeliveries/{idempotencyKey}` document, and then hands the immutable message to a provider adapter.
- Local emulator mode uses `LOCAL_PREVIEW` and writes the full rendered message to `emailPreviews/{idempotencyKey}`.
- Production uses `EMAIL_PROVIDER=HTTP`, which posts the rendered message to `EMAIL_PROVIDER_ENDPOINT` with `EMAIL_PROVIDER_API_KEY` as a bearer token.
- Failed sends stay in `emailDeliveries` with `status=FAILED`, `attempts`, `lastError`, and `nextAttemptAt`.
- `retryEmailDeliveriesScheduled` retries due failures every 15 minutes. Admins can also call `retryEmailDeliveries`.

## Trusted event sources

Email is emitted only after trusted backend state changes:

- `completeRegistration`: welcome and initial verification email.
- `sendVerificationEmail`: authenticated resend using Firebase Admin generated action codes.
- `requestPasswordResetEmail`: account-agnostic reset request using Firebase Admin generated action codes.
- `createCheckout`: order received email.
- `transitionOrder`: COD payment received, shipped, and delivered emails.
- `cancelMyOrder`: cancellation email.
- `paymentWebhook`: signed payment received or failed email.
- `initiateRefund` and `refundWebhook`: refund initiated, completed, and failed emails.
- `sendReturnRequestedEmail` and `sendReturnUpdatedEmail`: return lifecycle emails from Firestore return documents.

Every lifecycle message has a deterministic idempotency key such as `order:{orderId}:placed` or `refund:{refundId}:completed`, so retries and duplicate webhooks do not send duplicates.

## Required production configuration

Set these as function environment variables before production deploy:

```text
EMAIL_PROVIDER=HTTP
EMAIL_PROVIDER_ENDPOINT=https://provider.example/send
EMAIL_PROVIDER_API_KEY=...
EMAIL_FROM_EMAIL=no-reply@bazm.online
EMAIL_FROM_NAME=Bazm
APP_URL=https://bazm.online
PAYMENT_WEBHOOK_SECRET=...
```

If `EMAIL_PROVIDER`, endpoint, or API key is missing outside the emulator, delivery fails visibly in `emailDeliveries` with provider `UNCONFIGURED`; no client-side fallback exists.

## Domain authentication

Before sending from `bazm.online`, configure the email provider DNS:

- SPF: include the provider's sending host in the domain SPF record.
- DKIM: publish the provider's DKIM selector records and verify signing is active.
- DMARC: publish a DMARC record for `bazm.online`; start with monitoring, then move toward quarantine/reject once delivery is healthy.
- Bounce/complaint handling: configure provider webhooks or dashboards before high-volume sending.

## Template checks

`npm run test --workspace functions` renders every template preview and checks the basic accessibility contract: `lang`, article role, heading, text fallback, CTA link, and safe HTML escaping.
