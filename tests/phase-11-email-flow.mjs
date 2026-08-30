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

async function authRequest(endpoint, body) {
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

async function call(name, idToken, data = {}) {
  const headers = { "content-type": "application/json" };
  if (idToken) headers.authorization = `Bearer ${idToken}`;
  const response = await fetch(`${functionsOrigin}/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ data }),
  });
  return { response, data: await response.json() };
}

async function webhook(name, payload) {
  const body = JSON.stringify(payload);
  const response = await fetch(`${functionsOrigin}/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-bazm-signature": createHmac("sha256", "emulator-payment-secret")
        .update(body)
        .digest("hex"),
    },
    body,
  });
  return { response, data: await response.json() };
}

async function account(role, label) {
  const email = `phase11-${label}-${suffix}@example.test`;
  const signup = await authRequest("accounts:signUp", {
    email,
    password: "Secure123",
    returnSecureToken: true,
  });
  assert.ok(signup.response.ok, JSON.stringify(signup.data));
  const registration = await call("completeRegistration", signup.data.idToken, {
    name: `Phase Eleven ${label}`,
  });
  assert.ok(registration.response.ok, JSON.stringify(registration.data));
  await auth.setCustomUserClaims(signup.data.localId, {
    role,
    isActive: true,
    claimsVersion: 1,
  });
  return {
    uid: signup.data.localId,
    email,
    token: await token(signup.data.refreshToken),
  };
}

async function latestOobCode(email, requestType) {
  const response = await fetch(
    `${authOrigin}/emulator/v1/projects/${projectId}/oobCodes`,
  );
  const data = await response.json();
  const matches = (data.oobCodes ?? []).filter(
    (item) => item.email === email && item.requestType === requestType,
  );
  return matches.at(-1)?.oobCode ?? null;
}

async function waitForDelivery(id) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const snapshot = await firestore
      .collection("emailDeliveries")
      .doc(id)
      .get();
    if (snapshot.exists && snapshot.get("status") !== "PENDING") {
      return snapshot;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Email delivery ${id} was not completed.`);
}

async function assertSentDelivery(id, template) {
  const delivery = await waitForDelivery(id);
  assert.equal(delivery.get("status"), "SENT", `${id} was not sent`);
  assert.equal(delivery.get("template"), template);
  assert.equal(delivery.get("attempts"), 1);
  const preview = await firestore.collection("emailPreviews").doc(id).get();
  assert.ok(preview.exists, `${id} did not write a local preview`);
  assert.match(String(preview.get("htmlBody")), /<html lang="en">/);
  return delivery;
}

function stamp() {
  return {
    schemaVersion: 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

const total = { amountMinor: 5000, currency: "PKR" };
const address = {
  recipientName: "Phase Eleven Customer",
  phone: "+923001234567",
  line1: "11 Email Road",
  line2: null,
  area: "Gulberg",
  city: "Lahore",
  province: "PUNJAB",
  postalCode: "54000",
  deliveryInstructions: null,
};

try {
  const [customer, admin] = await Promise.all([
    account("CUSTOMER", "customer"),
    account("ADMIN", "admin"),
  ]);

  await assertSentDelivery(`auth:${customer.uid}:welcome`, "WELCOME");
  await assertSentDelivery(
    `auth:${customer.uid}:verify:initial`,
    "EMAIL_VERIFICATION",
  );
  assert.ok(
    await latestOobCode(customer.email, "VERIFY_EMAIL"),
    "Initial verification OOB code was not generated",
  );

  const verifyRequest = await call("sendVerificationEmail", customer.token);
  assert.ok(verifyRequest.response.ok, JSON.stringify(verifyRequest.data));
  const verifyKey = verifyRequest.data.result.delivery.idempotencyKey;
  await assertSentDelivery(verifyKey, "EMAIL_VERIFICATION");
  const verifyDuplicate = await call("sendVerificationEmail", customer.token);
  assert.equal(verifyDuplicate.data.result.delivery.duplicate, true);

  const resetRequest = await call("requestPasswordResetEmail", null, {
    email: customer.email,
  });
  assert.ok(resetRequest.response.ok, JSON.stringify(resetRequest.data));
  const resetKey = resetRequest.data.result.delivery.idempotencyKey;
  await assertSentDelivery(resetKey, "PASSWORD_RESET");
  assert.ok(
    await latestOobCode(customer.email, "PASSWORD_RESET"),
    "Password reset OOB code was not generated",
  );
  const resetDuplicate = await call("requestPasswordResetEmail", null, {
    email: customer.email,
  });
  assert.equal(resetDuplicate.data.result.delivery.duplicate, true);
  assert.ok(
    (
      await call("requestPasswordResetEmail", null, {
        email: `missing-${suffix}@example.test`,
      })
    ).response.ok,
    "Unknown reset email was not accepted generically",
  );

  const categoryId = `p11-category-${suffix}`;
  const productId = `p11-product-${suffix}`;
  const variantId = "email-m";
  const sku = `P11-EMAIL-${suffix}`;
  await firestore
    .collection("categories")
    .doc(categoryId)
    .create({
      name: "Email",
      slug: `email-${suffix}`,
      parentId: null,
      depth: 0,
      sortOrder: 0,
      image: null,
      seo: { title: null, description: null },
      status: "ACTIVE",
      archivedAt: null,
      ...stamp(),
    });
  const media = [
    {
      path: `products/phase11/${suffix}.webp`,
      url: `http://127.0.0.1:9199/phase11/${suffix}.webp`,
      alt: "Phase eleven kurta",
      width: 1200,
      height: 1600,
      contentType: "image/webp",
      contentHash: `phase11-${suffix}-0123456789abcdef`,
      sortOrder: 0,
    },
  ];
  await firestore
    .collection("products")
    .doc(productId)
    .create({
      name: "Email Flow Kurta",
      slug: `email-flow-kurta-${suffix}`,
      description:
        "A product used to verify transactional order and email lifecycle events.",
      categoryId,
      categoryPath: [categoryId],
      brand: "Bazm",
      basePrice: total,
      media,
      tags: ["email"],
      searchTokens: ["email", "kurta"],
      ratingSummary: { average: 0, count: 0 },
      flags: { featured: false, newArrival: false },
      seo: { title: null, description: null },
      status: "PUBLISHED",
      publishedAt: FieldValue.serverTimestamp(),
      archivedAt: null,
      ...stamp(),
    });
  await firestore
    .collection("products")
    .doc(productId)
    .collection("variants")
    .doc(variantId)
    .create({
      productId,
      sku,
      color: "Ivory",
      size: "M",
      priceOverride: null,
      media: [],
      isActive: true,
      ...stamp(),
    });
  await firestore
    .collection("inventory")
    .doc(sku)
    .create({
      sku,
      productId,
      variantId,
      available: 3,
      reserved: 0,
      sold: 0,
      returned: 0,
      damaged: 0,
      reorderPoint: 0,
      reservedUntil: null,
      ...stamp(),
    });

  assert.ok(
    (
      await call("addCartItem", customer.token, {
        productId,
        variantId,
        quantity: 1,
      })
    ).response.ok,
  );
  const createdAddress = await call("createAddress", customer.token, {
    label: "Home",
    ...address,
  });
  assert.ok(createdAddress.response.ok, JSON.stringify(createdAddress.data));
  const checkoutInput = {
    idempotencyKey: `phase11checkout${suffix}`,
    shippingAddressId: createdAddress.data.result.id,
    billingAddressId: null,
    couponCode: null,
    deliveryMethod: "STANDARD",
    paymentMethod: "CASH_ON_DELIVERY",
    customerNote: null,
  };
  const checkout = await call("createCheckout", customer.token, checkoutInput);
  assert.ok(checkout.response.ok, JSON.stringify(checkout.data));
  const orderId = checkout.data.result.orderId;
  await assertSentDelivery(`order:${orderId}:placed`, "ORDER_PLACED");
  await call("createCheckout", customer.token, checkoutInput);
  assert.equal(
    (
      await firestore
        .collection("emailDeliveries")
        .doc(`order:${orderId}:placed`)
        .get()
    ).get("attempts"),
    1,
    "Idempotent checkout resent the order email",
  );

  const paid = await call("transitionOrder", admin.token, {
    orderId,
    status: "PAID",
    trackingNumber: null,
    reason: "COD collected",
  });
  assert.ok(paid.response.ok, JSON.stringify(paid.data));
  const paymentId = (
    await firestore.collection("orders").doc(orderId).get()
  ).get("paymentId");
  await assertSentDelivery(`payment:${paymentId}:received`, "PAYMENT_RECEIVED");
  assert.equal(
    (await firestore.collection("payments").doc(paymentId).get()).get("status"),
    "PAID",
  );
  assert.ok(
    (
      await call("transitionOrder", admin.token, {
        orderId,
        status: "PROCESSING",
        trackingNumber: null,
        reason: "Packing",
      })
    ).response.ok,
  );
  assert.ok(
    (
      await call("transitionOrder", admin.token, {
        orderId,
        status: "SHIPPED",
        trackingNumber: "PK-EMAIL-11",
        reason: "Courier pickup",
      })
    ).response.ok,
  );
  await assertSentDelivery(`order:${orderId}:shipped`, "ORDER_SHIPPED");
  assert.ok(
    (
      await call("transitionOrder", admin.token, {
        orderId,
        status: "DELIVERED",
        trackingNumber: null,
        reason: "Delivered",
      })
    ).response.ok,
  );
  await assertSentDelivery(`order:${orderId}:delivered`, "ORDER_DELIVERED");

  const refund = await call("initiateRefund", admin.token, {
    paymentId,
    idempotencyKey: `refundphase11${suffix}`,
    amount: { amountMinor: 1000, currency: "PKR" },
    reason: "Phase 11 refund email",
  });
  assert.ok(refund.response.ok, JSON.stringify(refund.data));
  const refundId = refund.data.result.refundId;
  await assertSentDelivery(`refund:${refundId}:initiated`, "REFUND_INITIATED");
  assert.ok(
    (
      await webhook("refundWebhook", {
        eventId: `refund-email-complete-${suffix}`,
        refundId,
        status: "SUCCEEDED",
      })
    ).response.ok,
  );
  await assertSentDelivery(`refund:${refundId}:completed`, "REFUND_COMPLETED");

  const failedPaymentOrderId = `p11-failed-order-${suffix}`;
  const failedPaymentId = `p11-failed-payment-${suffix}`;
  await firestore
    .collection("orders")
    .doc(failedPaymentOrderId)
    .create({
      userId: customer.uid,
      status: "PENDING_PAYMENT",
      items: [
        {
          productId,
          variantId,
          productName: "Email Flow Kurta",
          sku,
          color: "Ivory",
          size: "M",
          quantity: 1,
          unitPrice: total,
          discountAmount: { amountMinor: 0, currency: "PKR" },
          taxAmount: { amountMinor: 0, currency: "PKR" },
          lineTotal: total,
          media: media[0],
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
      paymentId: failedPaymentId,
      reservationId: null,
      checkoutIdempotencyKey: `failed${suffix}`,
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
    .doc(failedPaymentId)
    .create({
      orderId: failedPaymentOrderId,
      userId: customer.uid,
      provider: "SANDBOX",
      providerPaymentId: null,
      amount: total,
      refundedAmount: { amountMinor: 0, currency: "PKR" },
      status: "PENDING",
      idempotencyKey: `payment_${customer.uid}_failed_${suffix}`,
      failureCode: null,
      providerEventIds: [],
      paidAt: null,
      ...stamp(),
    });
  assert.ok(
    (
      await webhook("paymentWebhook", {
        eventId: `payment-email-failed-${suffix}`,
        paymentId: failedPaymentId,
        providerPaymentId: `provider-failed-${suffix}`,
        status: "FAILED",
        amountMinor: total.amountMinor,
        currency: "PKR",
        occurredAt: new Date().toISOString(),
      })
    ).response.ok,
  );
  await assertSentDelivery(
    `payment:${failedPaymentId}:failed`,
    "PAYMENT_FAILED",
  );

  const cancelOrderId = `p11-cancel-order-${suffix}`;
  await firestore
    .collection("orders")
    .doc(cancelOrderId)
    .create({
      userId: customer.uid,
      status: "PENDING_PAYMENT",
      items: [
        {
          productId,
          variantId,
          productName: "Email Flow Kurta",
          sku,
          color: "Ivory",
          size: "M",
          quantity: 1,
          unitPrice: total,
          discountAmount: { amountMinor: 0, currency: "PKR" },
          taxAmount: { amountMinor: 0, currency: "PKR" },
          lineTotal: total,
          media: media[0],
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
      paymentId: null,
      reservationId: null,
      checkoutIdempotencyKey: `cancel${suffix}`,
      paymentMethod: "CASH_ON_DELIVERY",
      trackingNumber: null,
      deliveryMethod: "STANDARD",
      policyVersion: "2026-08",
      customerNote: null,
      adminNote: null,
      placedAt: FieldValue.serverTimestamp(),
      archivedAt: null,
      ...stamp(),
    });
  assert.ok(
    (await call("cancelMyOrder", customer.token, { orderId: cancelOrderId }))
      .response.ok,
  );
  await assertSentDelivery(
    `order:${cancelOrderId}:cancelled`,
    "ORDER_CANCELLED",
  );

  const returnId = `p11-return-${suffix}`;
  await firestore
    .collection("returns")
    .doc(returnId)
    .create({
      orderId,
      userId: customer.uid,
      items: [
        {
          orderItemId: variantId,
          productId,
          variantId,
          sku,
          quantity: 1,
          reason: "Fit was not right",
        },
      ],
      status: "REQUESTED",
      evidencePaths: [],
      customerNote: null,
      staffNote: null,
      refundPaymentId: paymentId,
      requestedAt: FieldValue.serverTimestamp(),
      receivedAt: null,
      archivedAt: null,
      ...stamp(),
    });
  await assertSentDelivery(`return:${returnId}:requested`, "RETURN_REQUESTED");
  await firestore.collection("returns").doc(returnId).update({
    status: "APPROVED",
    updatedAt: FieldValue.serverTimestamp(),
  });
  await assertSentDelivery(`return:${returnId}:approved`, "RETURN_UPDATED");

  console.log(
    "Phase 11 email flow passed auth links, templates, previews, lifecycle triggers, idempotency, and refund/return emails.",
  );
} finally {
  await deleteApp(app);
}
