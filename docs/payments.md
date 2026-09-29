# Demo payments

Checkout supports **Easypaisa**, **JazzCash**, and **Credit / debit card**. These
are simulated payment methods for this learning project. There are no gateway
credentials, Stripe SDK calls, wallet transfers, or real charges.

## Try the flow

1. Choose a size and quantity, then click **Buy it now** to save the item and open
   `/checkout`. **Add to cart** still opens your bag. Existing bag items are kept.
   Guests can explore the payment forms before signing in; choose **Sign in to pay**
   to finish with a verified account. The saved bag is merged automatically.
2. Save or choose a delivery address and select a payment method.
3. Choose **Use test details**, or enter a test mobile number such as
   `03001234567`. For cards, use `4242 4242 4242 4242`, a future `MM/YY`, any
   3–4 digit CVV, and a sample name. Do not enter real payment details.
4. Click **Pay Now**. The server waits two seconds, records a simulated successful
   payment, and opens `/checkout/confirmation/{orderId}`.
5. Reload the receipt or open it from your account’s order history. An unfinished
   demo order can be resumed from the same receipt URL.

Bags are saved in Firestore for both guests and signed-in shoppers. Guests use a
random, HttpOnly browser cookie lasting 30 days. Opening the bag after sign-in
merges guest items into the account cart once; matching variants have their
quantities added. Checkout waits for that merge before reading the account cart.

Normal application/Firebase configuration is sufficient; no payment secrets or
additional payment service are required. Demo checkout uses your configured
Firestore database and catalog, clears the cart, and finalizes inventory just
like a purchase. Use a test project/catalog when experimenting. Demo checkout
and payment completion do not send order or payment emails.

## API

`POST /api/payments/demo` requires a verified, active customer session and JSON.
It rejects cross-origin browser requests and returns private, non-cacheable
responses. Only allowlisted fields are accepted:

```json
{
  "checkout": {
    "idempotencyKey": "a-random-unique-checkout-key",
    "shippingAddressId": "saved-address-id",
    "billingAddressId": null,
    "couponCode": null,
    "deliveryMethod": "STANDARD",
    "paymentMethod": "EASYPAISA",
    "customerNote": null
  },
  "mobileNumber": "03001234567"
}
```

Use `JAZZCASH` or `CARD` for the other methods. Omit `mobileNumber` for cards.
Card holder, number, expiry, and CVV are validated only in browser memory and
are never included in the API request or stored. Wallet numbers are validated
by the API but not persisted in payment records. The order’s separate shipping
contact still belongs to its address snapshot.

To retry a saved demo order, send only `{ "orderId": "saved-order-id" }`.
Retries return the original payment and transaction IDs. If the first response
is lost, resend the original request with the same `idempotencyKey`.

Successful responses contain `ok: true`, `confirmationUrl`, and a `payment`
object with `isDemo: true`, `status: "PAID"`, `orderId`, `paymentId`,
`transactionId`, `method`, `amount`, and `paidAt`. The stored/API value `PAID`
is displayed as **Paid** in the UI. Errors use 400/401/403/404/409/415/503/500
as appropriate and provide an `error` message. Errors after order creation also
return `orderId` so the existing order can be resumed.

## Persistence and isolation

- `orders`: immutable items, addresses, totals, payment method, `isDemo: true`,
  linked payment ID, and status `PAID` after successful simulation.
- `payments`: provider `DEMO`, method, status `PAID`, random `pi_demo_…` payment
  ID, random `txn_demo_…` transaction ID, server-derived amount and paid timestamp.
- Payment, order status, inventory finalization, and audit entry are committed
  in one Firestore transaction. All inventory reads precede writes, including
  orders with multiple products.
- The completion service checks ownership, provider, amount, reservation, and
  order state. It cannot mark a Stripe, PayFast, COD, or legacy sandbox order paid.
- Failed, cancelled, expired, or released orders cannot be converted to paid.
  A refresh never creates a second payment.

## Validation

Run the frontend tests for card/mobile validation, all three forms, API request
validation, authorization, pending states, retries, and sensitive-field exclusion:

```sh
npm run test --workspace frontend
```

For real Firestore transaction tests, build the workspaces, then run against the
local emulator. The integration script refuses to run without a loopback
`FIRESTORE_EMULATOR_HOST` and always uses the demo project:

```sh
npm run build --workspace @bazm/domain
npm run build --workspace functions
firebase emulators:exec --only firestore --project demo-bazm-payments "node tests/demo-payment-flow.mjs"
```

The integration suite covers all methods, two-second processing, persistence,
server pricing, concurrent retries, ownership, multi-item inventory, live-provider
isolation, released reservations, cancelled orders, and input boundaries.

## Existing provider integration

The separate `PaymentService`, signed `paymentWebhook`, and refund APIs remain
available for the legacy sandbox/provider workflow. Those external events still
require their configured webhook secret. The new demo API uses its own explicit
`DEMO` provider; it does not manufacture signed webhooks or claim to be Stripe,
Easypaisa, or JazzCash. A future real gateway must tokenize card details through
its hosted SDK and verify payment events on the server. Never send raw PAN or
CVV through this application.
