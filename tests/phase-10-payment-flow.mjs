import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const projectId = "demo-bazm-online";
const apiKey = "demo-api-key";
const authOrigin = "http://127.0.0.1:9099";
const functionsOrigin = `http://127.0.0.1:5001/${projectId}/asia-south1`;
const suffix = Date.now().toString();
const app = getApps()[0] ?? initializeApp({ projectId });
const auth = getAuth(app);
const firestore = getFirestore(app);

async function request(endpoint, body) {
  const response = await fetch(
    `${authOrigin}/identitytoolkit.googleapis.com/v1/${endpoint}?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return { response, data: await response.json() };
}
async function token(refreshToken) {
  const response = await fetch(
    `${authOrigin}/securetoken.googleapis.com/v1/token?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    },
  );
  const data = await response.json();
  assert.ok(response.ok && data.id_token);
  return data.id_token;
}
async function call(name, idToken, data) {
  const response = await fetch(`${functionsOrigin}/${name}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${idToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ data }),
  });
  return { response, data: await response.json() };
}
async function account(role) {
  const signup = await request("accounts:signUp", {
    email: `phase10-${role}-${suffix}@example.test`,
    password: "Secure123",
    returnSecureToken: true,
  });
  assert.ok(signup.response.ok);
  assert.ok(
    (
      await call("completeRegistration", signup.data.idToken, {
        name: `Phase Ten ${role}`,
      })
    ).response.ok,
  );
  await auth.setCustomUserClaims(signup.data.localId, {
    role,
    isActive: true,
    claimsVersion: 1,
  });
  return {
    uid: signup.data.localId,
    token: await token(signup.data.refreshToken),
  };
}
async function webhook(name, payload, signature = true) {
  const body = JSON.stringify(payload);
  const response = await fetch(`${functionsOrigin}/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-bazm-signature": signature
        ? createHmac("sha256", "emulator-payment-secret")
            .update(body)
            .digest("hex")
        : "0".repeat(64),
    },
    body,
  });
  return { response, data: await response.json() };
}

const stamp = () => ({
  schemaVersion: 1,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});
const address = {
  recipientName: "Phase Ten Customer",
  phone: "+923001234567",
  line1: "42 Bazaar Road",
  line2: null,
  area: "Gulberg",
  city: "Lahore",
  province: "PUNJAB",
  postalCode: "54000",
  deliveryInstructions: null,
};

try {
  const [customer, admin] = await Promise.all([
    account("CUSTOMER"),
    account("ADMIN"),
  ]);
  const sku = `P10-PAYMENT-${suffix}`;
  await firestore
    .collection("inventory")
    .doc(sku)
    .create({
      sku,
      productId: `p10-product-${suffix}`,
      variantId: "card-m",
      available: 2,
      reserved: 0,
      sold: 0,
      returned: 0,
      damaged: 0,
      reorderPoint: 0,
      reservedUntil: null,
      ...stamp(),
    });

  async function createPayableOrder(label) {
    const reservation = await call("reserveInventory", customer.token, {
      idempotencyKey: `reserve${label}${suffix}`,
      lines: [{ sku, quantity: 1 }],
    });
    assert.ok(reservation.response.ok);
    const orderId = `p10-order-${label}-${suffix}`;
    const paymentId = `p10-payment-${label}-${suffix}`;
    const total = { amountMinor: 5000, currency: "PKR" };
    await firestore
      .collection("orders")
      .doc(orderId)
      .create({
        userId: customer.uid,
        status: "PENDING_PAYMENT",
        items: [
          {
            productId: `p10-product-${suffix}`,
            variantId: "card-m",
            productName: "Payment Test Shirt",
            sku,
            color: "Black",
            size: "M",
            quantity: 1,
            unitPrice: total,
            discountAmount: { amountMinor: 0, currency: "PKR" },
            taxAmount: { amountMinor: 0, currency: "PKR" },
            lineTotal: total,
            media: null,
          },
        ],
        shippingAddress: address,
        billingAddress: address,
        totals: {
          subtotal: total,
          discount: { amountMinor: 0, currency: "PKR" },
          shipping: { amountMinor: 0, currency: "PKR" },
          tax: { amountMinor: 0, currency: "PKR" },
          grandTotal: total,
          currency: "PKR",
        },
        couponId: null,
        couponCode: null,
        paymentId,
        reservationId: reservation.data.result.reservationId,
        checkoutIdempotencyKey: `checkout${label}${suffix}`,
        paymentMethod: "CARD",
        trackingNumber: null,
        deliveryMethod: "STANDARD",
        policyVersion: "2026-08",
        customerNote: null,
        adminNote: null,
        placedAt: FieldValue.serverTimestamp(),
        archivedAt: null,
        ...stamp(),
      });
    await firestore
      .collection("payments")
      .doc(paymentId)
      .create({
        orderId,
        userId: customer.uid,
        provider: "SANDBOX",
        providerPaymentId: null,
        amount: total,
        refundedAmount: { amountMinor: 0, currency: "PKR" },
        status: "PENDING",
        idempotencyKey: `payment_${customer.uid}_${label}_${suffix}`,
        failureCode: null,
        providerEventIds: [],
        paidAt: null,
        ...stamp(),
      });
    return {
      orderId,
      paymentId,
      reservationId: reservation.data.result.reservationId,
      total,
    };
  }

  const paid = await createPayableOrder("paid");
  const attempt = await call("createPaymentAttempt", customer.token, {
    orderId: paid.orderId,
  });
  assert.ok(
    attempt.response.ok && attempt.data.result.redirectUrl.includes("attempt="),
  );
  assert.equal(
    (
      await call("createPaymentAttempt", customer.token, {
        orderId: paid.orderId,
      })
    ).data.result.redirectUrl,
    attempt.data.result.redirectUrl,
    "Payment attempt was not idempotent",
  );
  const validEvent = {
    eventId: `event-paid-${suffix}`,
    paymentId: paid.paymentId,
    providerPaymentId: `sandbox-paid-${suffix}`,
    status: "PAID",
    amountMinor: 5000,
    currency: "PKR",
    occurredAt: new Date().toISOString(),
  };
  assert.equal(
    (await webhook("paymentWebhook", validEvent, false)).response.status,
    401,
  );
  assert.equal(
    (
      await webhook("paymentWebhook", {
        ...validEvent,
        eventId: `event-stale-${suffix}`,
        occurredAt: "2020-01-01T00:00:00.000Z",
      })
    ).response.status,
    400,
  );
  assert.ok((await webhook("paymentWebhook", validEvent)).response.ok);
  assert.equal(
    (await firestore.collection("payments").doc(paid.paymentId).get()).get(
      "status",
    ),
    "PAID",
  );
  assert.equal(
    (await firestore.collection("orders").doc(paid.orderId).get()).get(
      "status",
    ),
    "PAID",
  );
  assert.equal(
    (
      await firestore
        .collection("inventoryReservations")
        .doc(paid.reservationId)
        .get()
    ).get("status"),
    "FINALIZED",
  );
  assert.equal(
    (await firestore.collection("inventory").doc(sku).get()).get("sold"),
    1,
  );
  assert.equal(
    (await webhook("paymentWebhook", validEvent)).data.duplicate,
    true,
    "Webhook replay was not ignored",
  );

  const failedRefund = await call("initiateRefund", admin.token, {
    paymentId: paid.paymentId,
    idempotencyKey: `refundfail${suffix}`,
    amount: { amountMinor: 500, currency: "PKR" },
    reason: "Sandbox refusal check",
  });
  assert.ok(failedRefund.response.ok);
  assert.ok(
    (
      await webhook("refundWebhook", {
        eventId: `refund-fail-${suffix}`,
        refundId: failedRefund.data.result.refundId,
        status: "FAILED",
      })
    ).response.ok,
  );
  assert.equal(
    (await firestore.collection("payments").doc(paid.paymentId).get()).get(
      "status",
    ),
    "PAID",
  );
  const partial = await call("initiateRefund", admin.token, {
    paymentId: paid.paymentId,
    idempotencyKey: `refundpart${suffix}`,
    amount: { amountMinor: 1000, currency: "PKR" },
    reason: "Partial sandbox refund",
  });
  assert.ok(partial.response.ok);
  const partialEvent = {
    eventId: `refund-part-${suffix}`,
    refundId: partial.data.result.refundId,
    status: "SUCCEEDED",
  };
  assert.ok((await webhook("refundWebhook", partialEvent)).response.ok);
  assert.equal(
    (await webhook("refundWebhook", partialEvent)).data.duplicate,
    true,
  );
  assert.equal(
    (await firestore.collection("payments").doc(paid.paymentId).get()).get(
      "status",
    ),
    "PARTIALLY_REFUNDED",
  );
  const full = await call("initiateRefund", admin.token, {
    paymentId: paid.paymentId,
    idempotencyKey: `refundfull${suffix}`,
    amount: { amountMinor: 4000, currency: "PKR" },
    reason: "Full sandbox refund",
  });
  assert.ok(full.response.ok);
  assert.ok(
    (
      await webhook("refundWebhook", {
        eventId: `refund-full-${suffix}`,
        refundId: full.data.result.refundId,
        status: "SUCCEEDED",
      })
    ).response.ok,
  );
  assert.equal(
    (await firestore.collection("payments").doc(paid.paymentId).get()).get(
      "status",
    ),
    "REFUNDED",
  );

  const failed = await createPayableOrder("failed");
  assert.ok(
    (
      await webhook("paymentWebhook", {
        eventId: `event-failed-${suffix}`,
        paymentId: failed.paymentId,
        providerPaymentId: `sandbox-failed-${suffix}`,
        status: "FAILED",
        amountMinor: 5000,
        currency: "PKR",
        occurredAt: new Date().toISOString(),
      })
    ).response.ok,
  );
  const inventory = await firestore.collection("inventory").doc(sku).get();
  assert.deepEqual(
    {
      available: inventory.get("available"),
      reserved: inventory.get("reserved"),
      sold: inventory.get("sold"),
    },
    { available: 1, reserved: 0, sold: 1 },
    "Order, payment, and inventory reconciliation failed",
  );
  assert.equal(
    (await firestore.collection("orders").doc(failed.orderId).get()).get(
      "status",
    ),
    "CANCELLED",
  );
  console.log("Phase 10 payment flow passed.");
} finally {
  await deleteApp(app);
}
