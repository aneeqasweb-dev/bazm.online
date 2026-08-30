# Payment integration

The payment domain is provider-independent: checkout creates an immutable
payment record, `PaymentService` creates one idempotent attempt, and payment
providers notify the `paymentWebhook` endpoint. The browser never provides an
amount, changes a payment status, or handles card data.

## Sandbox configuration blocker

No live provider credentials are stored in this repository. Before deploying a
provider adapter, configure `PAYMENT_WEBHOOK_SECRET` as a managed server secret
and have the provider sign its exact raw JSON body with HMAC-SHA256. The local
emulator only accepts the test secret `emulator-payment-secret`.

The current `/checkout/payment/sandbox` page represents the provider redirect
return. It deliberately cannot mark a payment successful; only a verified
webhook can update payment, order, inventory reservation, inventory ledger, or
refund state.

## Adapter requirements

- Derive amount, currency, customer, and order from the server payment record.
- Map provider outcomes to `PAID`, `FAILED`, or `CANCELLED` before the webhook
  boundary.
- Send an immutable event ID and provider payment reference for every webhook.
- Never store PAN, CVV, card tokens, or raw provider credentials in Firestore.
- Initiate refunds through `initiateRefund`; complete them only through the
  signed `refundWebhook` endpoint.
