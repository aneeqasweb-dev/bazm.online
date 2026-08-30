import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";

const projectId = "demo-bazm-online";
const apiKey = "demo-api-key";
const authOrigin = "http://127.0.0.1:9099";
const functionsOrigin = `http://127.0.0.1:5001/${projectId}/asia-south1`;
const appOrigin = "http://127.0.0.1:3101";
const suffix = Date.now().toString();
const password = "Secure123";
const policyVersion = `returns-phase-15-${suffix}`;

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

async function refreshToken(refreshToken) {
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
  assert.ok(response.ok && data.id_token, "Token refresh failed");
  return data.id_token;
}

async function call(name, idToken, data = {}) {
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

async function account(role, label, permissions = []) {
  const email = `phase-15-${label}-${suffix}@example.test`;
  const signUp = await authRequest("accounts:signUp", {
    email,
    password,
    returnSecureToken: true,
  });
  assert.ok(signUp.response.ok && signUp.data.idToken && signUp.data.localId);
  const registration = await call("completeRegistration", signUp.data.idToken, {
    name: `Phase Fifteen ${label}`,
  });
  assert.ok(registration.response.ok, `${label} registration failed`);
  await Promise.all([
    auth.updateUser(signUp.data.localId, { emailVerified: true }),
    firestore.collection("users").doc(signUp.data.localId).update({
      emailVerified: true,
      role,
      isActive: true,
      permissions,
      updatedAt: FieldValue.serverTimestamp(),
    }),
  ]);
  await auth.setCustomUserClaims(signUp.data.localId, {
    role,
    isActive: true,
    claimsVersion: 1,
    ...(permissions.length ? { permissions } : {}),
  });
  return {
    email,
    refreshToken: signUp.data.refreshToken,
    token: await refreshToken(signUp.data.refreshToken),
    uid: signUp.data.localId,
  };
}

function storageUrl(path) {
  return `http://127.0.0.1:9199/v0/b/${projectId}.appspot.com/o/${encodeURIComponent(
    path,
  )}?alt=media`;
}

function mediaAsset(path) {
  return {
    path,
    url: storageUrl(path),
    alt: "Phase fifteen product image",
    width: 1200,
    height: 1500,
    contentType: "image/webp",
    contentHash: `phase15hash${suffix}${path.length}`,
    sortOrder: 0,
  };
}

function address() {
  return {
    recipientName: "Phase Fifteen Customer",
    phone: "+923001234567",
    line1: "15 Returns Road",
    line2: null,
    area: "Gulberg",
    city: "Lahore",
    province: "PUNJAB",
    postalCode: "54000",
    deliveryInstructions: null,
  };
}

function stamp(now = Timestamp.now()) {
  return {
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
}

function orderPayload({
  amountMinor,
  orderId,
  placedAt,
  productId,
  quantity,
  status,
  userId,
  variantId,
}) {
  const sku = `P15-SKU-${suffix}`;
  const amount = { amountMinor, currency: "PKR" };
  return {
    userId,
    status,
    items: [
      {
        productId,
        variantId,
        productName: "Phase Fifteen Kurta",
        sku,
        color: "Ivory",
        size: "M",
        quantity,
        unitPrice: {
          amountMinor: Math.floor(amountMinor / quantity),
          currency: "PKR",
        },
        discountAmount: { amountMinor: 0, currency: "PKR" },
        taxAmount: { amountMinor: 0, currency: "PKR" },
        lineTotal: amount,
        media: mediaAsset(`products/phase-15-${suffix}/primary.webp`),
      },
    ],
    shippingAddress: address(),
    billingAddress: address(),
    totals: {
      subtotal: amount,
      discount: { amountMinor: 0, currency: "PKR" },
      shipping: { amountMinor: 0, currency: "PKR" },
      tax: { amountMinor: 0, currency: "PKR" },
      grandTotal: amount,
      currency: "PKR",
    },
    couponId: null,
    couponCode: null,
    paymentId: `p15-payment-${orderId}`,
    reservationId: null,
    checkoutIdempotencyKey: `p15-checkout-${orderId}`.slice(0, 80),
    paymentMethod: "CARD",
    trackingNumber: "TRK-P15",
    deliveryMethod: "STANDARD",
    policyVersion,
    customerNote: null,
    adminNote: null,
    placedAt,
    archivedAt: null,
    ...stamp(placedAt),
  };
}

async function seedOrder({
  amountMinor,
  customer,
  id,
  placedAt,
  productId,
  quantity,
  status,
  variantId,
}) {
  const orderId = `p15-${id}-${suffix}`;
  const paymentId = `p15-payment-${orderId}`;
  await firestore
    .collection("orders")
    .doc(orderId)
    .set(
      orderPayload({
        amountMinor,
        orderId,
        placedAt,
        productId,
        quantity,
        status,
        userId: customer.uid,
        variantId,
      }),
    );
  await firestore
    .collection("payments")
    .doc(paymentId)
    .set({
      orderId,
      userId: customer.uid,
      provider: "SANDBOX",
      providerPaymentId: `provider-${paymentId}`,
      amount: { amountMinor, currency: "PKR" },
      refundedAmount: { amountMinor: 0, currency: "PKR" },
      status: "PAID",
      idempotencyKey: `phase-15-payment-${id}-${suffix}`,
      failureCode: null,
      providerEventIds: [`phase-15-paid-${id}-${suffix}`],
      paidAt: placedAt,
      ...stamp(placedAt),
    });
  return { orderId, paymentId };
}

async function seedFixture(customer, other) {
  const now = Timestamp.now();
  const productId = `p15-product-${suffix}`;
  const variantId = `p15-variant-${suffix}`;
  const sku = `P15-SKU-${suffix}`;
  await firestore
    .collection("settings")
    .doc("returns.policy")
    .set({
      key: "returns.policy",
      visibility: "PUBLIC",
      value: {
        version: policyVersion,
        windowDays: 14,
        eligibleStatuses: ["DELIVERED", "RETURN_REQUESTED"],
        reasons: ["Wrong size", "Damaged item", "Changed mind"],
        restockingFee: { amountMinor: 0, currency: "PKR" },
        restoreResellableStock: true,
      },
      revision: 1,
      ...stamp(now),
    });
  await firestore
    .collection("products")
    .doc(productId)
    .set({
      name: "Phase Fifteen Kurta",
      slug: `phase-fifteen-kurta-${suffix}`,
      description:
        "A return and refund lifecycle product used for Phase 15 verification.",
      categoryId: `p15-category-${suffix}`,
      categoryPath: [`p15-category-${suffix}`],
      brand: "Bazm",
      basePrice: { amountMinor: 100_000, currency: "PKR" },
      media: [mediaAsset(`products/phase-15-${suffix}/primary.webp`)],
      tags: ["phase-fifteen"],
      searchTokens: ["phase", "fifteen", "kurta", "returns"],
      ratingSummary: { average: 0, count: 0 },
      flags: { featured: false, newArrival: true },
      seo: { title: null, description: null },
      status: "PUBLISHED",
      publishedAt: now,
      archivedAt: null,
      ...stamp(now),
    });
  await firestore
    .collection("products")
    .doc(productId)
    .collection("variants")
    .doc(variantId)
    .set({
      productId,
      sku,
      color: "Ivory",
      size: "M",
      priceOverride: null,
      media: [],
      isActive: true,
      ...stamp(now),
    });
  await firestore
    .collection("inventory")
    .doc(sku)
    .set({
      sku,
      productId,
      variantId,
      available: 10,
      reserved: 0,
      sold: 6,
      returned: 0,
      damaged: 0,
      reorderPoint: 0,
      reservedUntil: null,
      ...stamp(now),
    });

  const orders = {
    partial: await seedOrder({
      id: "partial",
      amountMinor: 100_000,
      customer,
      placedAt: now,
      productId,
      quantity: 2,
      status: "DELIVERED",
      variantId,
    }),
    full: await seedOrder({
      id: "full",
      amountMinor: 60_000,
      customer,
      placedAt: now,
      productId,
      quantity: 1,
      status: "DELIVERED",
      variantId,
    }),
    damaged: await seedOrder({
      id: "damaged",
      amountMinor: 70_000,
      customer,
      placedAt: now,
      productId,
      quantity: 1,
      status: "DELIVERED",
      variantId,
    }),
    rejected: await seedOrder({
      id: "rejected",
      amountMinor: 30_000,
      customer,
      placedAt: now,
      productId,
      quantity: 1,
      status: "DELIVERED",
      variantId,
    }),
    refundFailure: await seedOrder({
      id: "refund-failure",
      amountMinor: 40_000,
      customer,
      placedAt: now,
      productId,
      quantity: 1,
      status: "DELIVERED",
      variantId,
    }),
    premature: await seedOrder({
      id: "premature",
      amountMinor: 20_000,
      customer,
      placedAt: now,
      productId,
      quantity: 1,
      status: "SHIPPED",
      variantId,
    }),
    expired: await seedOrder({
      id: "expired",
      amountMinor: 20_000,
      customer,
      placedAt: Timestamp.fromMillis(Date.now() - 30 * 86_400_000),
      productId,
      quantity: 1,
      status: "DELIVERED",
      variantId,
    }),
    foreign: await seedOrder({
      id: "foreign",
      amountMinor: 20_000,
      customer: other,
      placedAt: now,
      productId,
      quantity: 1,
      status: "DELIVERED",
      variantId,
    }),
  };

  return { orders, productId, sku, variantId };
}

function returnPayload(orderId, variantId, customer, quantity = 1) {
  return {
    orderId,
    items: [{ orderItemId: variantId, quantity, reason: "Wrong size" }],
    evidencePaths: [`returns/${customer.uid}/phase-15-${suffix}.webp`],
    customerNote: "The fit was not right.",
  };
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
  return delivery;
}

async function createSession(idToken) {
  const response = await fetch(`${appOrigin}/api/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: appOrigin },
    body: JSON.stringify({ idToken }),
  });
  const sessionCookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(response.ok && sessionCookie, "Web session failed");
  return sessionCookie;
}

async function waitForNextServer(server) {
  let serverOutput = "";
  server.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${appOrigin}/login`);
      if (response.ok) return;
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Next.js server did not start. ${serverOutput}`);
}

async function stopNextServer(server) {
  const stopped = new Promise((resolve) => server.once("exit", resolve));
  server.kill("SIGTERM");
  await Promise.race([
    stopped,
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (server.exitCode === null && server.signalCode === null) {
    server.kill("SIGKILL");
    await stopped;
  }
}

async function createReturnOrFail(customer, order, fixture, quantity = 1) {
  const response = await call(
    "createReturn",
    customer.token,
    returnPayload(order.orderId, fixture.variantId, customer, quantity),
  );
  assert.ok(response.response.ok, JSON.stringify(response.data));
  return response.data.result.returnId;
}

async function approveReceiveRefund({
  admin,
  condition = "RESELLABLE",
  fixture,
  order,
  refundAmount,
  refundKey,
  webhookStatus = "SUCCEEDED",
}) {
  const returnId = await createReturnOrFail(admin.customer, order, fixture);
  assert.ok(
    (
      await call("updateReturnStatus", admin.token, {
        returnId,
        status: "APPROVED",
        staffNote: "Approved under Phase 15 policy.",
        refundPaymentId: null,
      })
    ).response.ok,
    "Return approval failed",
  );
  assert.ok(
    (
      await call("updateReturnStatus", admin.token, {
        returnId,
        status: "RECEIVED",
        condition,
        staffNote: "Return received by operations.",
        refundPaymentId: null,
      })
    ).response.ok,
    "Return receipt failed",
  );
  const refund = await call("updateReturnStatus", admin.token, {
    returnId,
    status: "REFUNDED",
    refundPaymentId: order.paymentId,
    refundAmount: { amountMinor: refundAmount, currency: "PKR" },
    refundIdempotencyKey: refundKey,
    refundReason: "Phase 15 return refund.",
    staffNote: "Refund submitted to provider.",
  });
  assert.ok(refund.response.ok, JSON.stringify(refund.data));
  const refundId = refund.data.result.refundId;
  const event = await webhook("refundWebhook", {
    eventId: `${refundKey}-event-${suffix}`,
    refundId,
    status: webhookStatus,
  });
  assert.ok(event.response.ok, JSON.stringify(event.data));
  return { returnId, refundId };
}

try {
  const [customer, other, admin, orderStaff] = await Promise.all([
    account("CUSTOMER", "customer"),
    account("CUSTOMER", "other"),
    account("ADMIN", "admin"),
    account("STAFF", "order-staff", ["orders.manage"]),
  ]);
  const fixture = await seedFixture(customer, other);

  const foreign = await call(
    "createReturn",
    customer.token,
    returnPayload(fixture.orders.foreign.orderId, fixture.variantId, customer),
  );
  assert.equal(foreign.response.ok, false, "Foreign order return succeeded");

  const premature = await call(
    "createReturn",
    customer.token,
    returnPayload(
      fixture.orders.premature.orderId,
      fixture.variantId,
      customer,
    ),
  );
  assert.equal(premature.response.ok, false, "Premature return succeeded");

  const expired = await call(
    "createReturn",
    customer.token,
    returnPayload(fixture.orders.expired.orderId, fixture.variantId, customer),
  );
  assert.equal(expired.response.ok, false, "Expired return succeeded");

  const excessive = await call(
    "createReturn",
    customer.token,
    returnPayload(
      fixture.orders.partial.orderId,
      fixture.variantId,
      customer,
      3,
    ),
  );
  assert.equal(excessive.response.ok, false, "Excessive quantity succeeded");

  const invalidReason = await call("createReturn", customer.token, {
    ...returnPayload(
      fixture.orders.partial.orderId,
      fixture.variantId,
      customer,
    ),
    items: [
      {
        orderItemId: fixture.variantId,
        quantity: 1,
        reason: "Not configured",
      },
    ],
  });
  assert.equal(invalidReason.response.ok, false, "Invalid reason succeeded");

  const invalidEvidence = await call("createReturn", customer.token, {
    ...returnPayload(
      fixture.orders.partial.orderId,
      fixture.variantId,
      customer,
    ),
    evidencePaths: [`returns/${other.uid}/phase-15.webp`],
  });
  assert.equal(
    invalidEvidence.response.ok,
    false,
    "Foreign return evidence path succeeded",
  );

  const partialReturnId = await createReturnOrFail(
    customer,
    fixture.orders.partial,
    fixture,
  );
  await assertSentDelivery(
    `return:${partialReturnId}:requested`,
    "RETURN_REQUESTED",
  );
  const partialReturn = await firestore
    .collection("returns")
    .doc(partialReturnId)
    .get();
  assert.equal(partialReturn.get("policyVersion"), policyVersion);
  assert.equal(partialReturn.get("restockingFee.amountMinor"), 0);
  assert.equal(partialReturn.get("refundAmount.amountMinor"), 50_000);
  assert.ok(partialReturn.get("returnWindowEndsAt"));

  const duplicateQuantity = await call(
    "createReturn",
    customer.token,
    returnPayload(
      fixture.orders.partial.orderId,
      fixture.variantId,
      customer,
      2,
    ),
  );
  assert.equal(
    duplicateQuantity.response.ok,
    false,
    "Duplicate return quantity succeeded",
  );

  const unauthorizedApproval = await call(
    "updateReturnStatus",
    orderStaff.token,
    {
      returnId: partialReturnId,
      status: "APPROVED",
      staffNote: "Trying without returns permission.",
      refundPaymentId: null,
    },
  );
  assert.equal(
    unauthorizedApproval.response.ok,
    false,
    "Staff without returns.manage updated a return",
  );

  const invalidTransition = await call("updateReturnStatus", admin.token, {
    returnId: partialReturnId,
    status: "RECEIVED",
    condition: "RESELLABLE",
    staffNote: "Skipping approval should fail.",
    refundPaymentId: null,
  });
  assert.equal(
    invalidTransition.response.ok,
    false,
    "Requested return moved directly to received",
  );

  const approved = await call("updateReturnStatus", admin.token, {
    returnId: partialReturnId,
    status: "APPROVED",
    staffNote: "Approved under Phase 15 policy.",
    refundPaymentId: null,
  });
  assert.ok(approved.response.ok, "Return approval failed");
  await assertSentDelivery(
    `return:${partialReturnId}:approved`,
    "RETURN_UPDATED",
  );

  const duplicateApproval = await call("updateReturnStatus", admin.token, {
    returnId: partialReturnId,
    status: "APPROVED",
    staffNote: "Approval note retry.",
    refundPaymentId: null,
  });
  assert.ok(duplicateApproval.response.ok, "Idempotent approval retry failed");
  await new Promise((resolve) => setTimeout(resolve, 750));
  assert.equal(
    (
      await firestore
        .collection("emailDeliveries")
        .doc(`return:${partialReturnId}:approved`)
        .get()
    ).get("attempts"),
    1,
    "Approval notification fired more than once",
  );

  const beforeInventory = await firestore
    .collection("inventory")
    .doc(fixture.sku)
    .get();
  const received = await call("updateReturnStatus", admin.token, {
    returnId: partialReturnId,
    status: "RECEIVED",
    condition: "RESELLABLE",
    staffNote: "Resellable item received.",
    refundPaymentId: null,
  });
  assert.ok(received.response.ok, "Return receipt failed");
  let inventory = await firestore
    .collection("inventory")
    .doc(fixture.sku)
    .get();
  assert.equal(
    inventory.get("available"),
    beforeInventory.get("available") + 1,
    "Resellable stock was not restored",
  );
  assert.equal(inventory.get("returned"), beforeInventory.get("returned") + 1);

  const repeatedReceive = await call("updateReturnStatus", admin.token, {
    returnId: partialReturnId,
    status: "RECEIVED",
    condition: "RESELLABLE",
    staffNote: "Retry receipt event.",
    refundPaymentId: null,
  });
  assert.ok(repeatedReceive.response.ok, "Receipt retry should be idempotent");
  inventory = await firestore.collection("inventory").doc(fixture.sku).get();
  assert.equal(
    inventory.get("available"),
    beforeInventory.get("available") + 1,
    "Receipt retry restored stock twice",
  );

  const overRefund = await call("updateReturnStatus", admin.token, {
    returnId: partialReturnId,
    status: "REFUNDED",
    refundPaymentId: fixture.orders.partial.paymentId,
    refundAmount: { amountMinor: 50_001, currency: "PKR" },
    refundIdempotencyKey: `p15-over-${suffix}`,
    refundReason: "Over refund should fail.",
    staffNote: "Over refund should fail.",
  });
  assert.equal(overRefund.response.ok, false, "Over-refund succeeded");

  const refund = await call("updateReturnStatus", admin.token, {
    returnId: partialReturnId,
    status: "REFUNDED",
    refundPaymentId: fixture.orders.partial.paymentId,
    refundAmount: { amountMinor: 50_000, currency: "PKR" },
    refundIdempotencyKey: `p15-partial-${suffix}`,
    refundReason: "Partial return refund.",
    staffNote: "Refund submitted to provider.",
  });
  assert.ok(refund.response.ok, JSON.stringify(refund.data));
  assert.equal(refund.data.result.status, "RECEIVED");
  const duplicateRefund = await call("updateReturnStatus", admin.token, {
    returnId: partialReturnId,
    status: "REFUNDED",
    refundPaymentId: fixture.orders.partial.paymentId,
    refundAmount: { amountMinor: 50_000, currency: "PKR" },
    refundIdempotencyKey: `p15-partial-duplicate-${suffix}`,
    refundReason: "Duplicate partial return refund.",
    staffNote: "Refund retry.",
  });
  assert.ok(duplicateRefund.response.ok, "Duplicate refund initiation failed");
  assert.equal(
    duplicateRefund.data.result.refundId,
    refund.data.result.refundId,
    "Duplicate active refund created for a return",
  );

  const refundEvent = {
    eventId: `p15-partial-refund-${suffix}`,
    refundId: refund.data.result.refundId,
    status: "SUCCEEDED",
  };
  assert.ok((await webhook("refundWebhook", refundEvent)).response.ok);
  assert.equal(
    (await webhook("refundWebhook", refundEvent)).data.duplicate,
    true,
    "Refund webhook replay was not ignored",
  );
  let payment = await firestore
    .collection("payments")
    .doc(fixture.orders.partial.paymentId)
    .get();
  assert.equal(payment.get("status"), "PARTIALLY_REFUNDED");
  assert.equal(payment.get("refundedAmount.amountMinor"), 50_000);
  let returnSnapshot = await firestore
    .collection("returns")
    .doc(partialReturnId)
    .get();
  assert.equal(returnSnapshot.get("status"), "REFUNDED");
  assert.ok(returnSnapshot.get("refundedAt"));
  assert.equal(
    (
      await firestore
        .collection("orders")
        .doc(fixture.orders.partial.orderId)
        .get()
    ).get("status"),
    "RETURNED",
  );

  await approveReceiveRefund({
    admin: { ...admin, customer },
    fixture,
    order: fixture.orders.full,
    refundAmount: 60_000,
    refundKey: `p15-full-${suffix}`,
  });
  payment = await firestore
    .collection("payments")
    .doc(fixture.orders.full.paymentId)
    .get();
  assert.equal(payment.get("status"), "REFUNDED");
  assert.equal(
    (
      await firestore
        .collection("orders")
        .doc(fixture.orders.full.orderId)
        .get()
    ).get("status"),
    "REFUNDED",
  );

  const damagedReturnId = await createReturnOrFail(
    customer,
    fixture.orders.damaged,
    fixture,
  );
  assert.ok(
    (
      await call("updateReturnStatus", admin.token, {
        returnId: damagedReturnId,
        status: "APPROVED",
        staffNote: "Damaged path approved.",
        refundPaymentId: null,
      })
    ).response.ok,
  );
  const beforeDamaged = await firestore
    .collection("inventory")
    .doc(fixture.sku)
    .get();
  assert.ok(
    (
      await call("updateReturnStatus", admin.token, {
        returnId: damagedReturnId,
        status: "RECEIVED",
        condition: "DAMAGED",
        staffNote: "Returned item is damaged.",
        refundPaymentId: null,
      })
    ).response.ok,
  );
  inventory = await firestore.collection("inventory").doc(fixture.sku).get();
  assert.equal(
    inventory.get("available"),
    beforeDamaged.get("available"),
    "Damaged return should not restore available stock",
  );
  assert.equal(inventory.get("damaged"), beforeDamaged.get("damaged") + 1);

  const rejectedReturnId = await createReturnOrFail(
    customer,
    fixture.orders.rejected,
    fixture,
  );
  const rejected = await call("updateReturnStatus", admin.token, {
    returnId: rejectedReturnId,
    status: "REJECTED",
    staffNote: "Rejected after policy review.",
    refundPaymentId: null,
  });
  assert.ok(rejected.response.ok, "Return rejection failed");
  assert.equal(
    (await firestore.collection("returns").doc(rejectedReturnId).get()).get(
      "status",
    ),
    "REJECTED",
  );
  assert.equal(
    (
      await firestore
        .collection("orders")
        .doc(fixture.orders.rejected.orderId)
        .get()
    ).get("status"),
    "DELIVERED",
  );
  const receiveRejected = await call("updateReturnStatus", admin.token, {
    returnId: rejectedReturnId,
    status: "RECEIVED",
    condition: "RESELLABLE",
    staffNote: "Rejected return cannot be received.",
    refundPaymentId: null,
  });
  assert.equal(receiveRejected.response.ok, false, "Rejected return received");

  const failedRefund = await approveReceiveRefund({
    admin: { ...admin, customer },
    fixture,
    order: fixture.orders.refundFailure,
    refundAmount: 40_000,
    refundKey: `p15-failed-${suffix}`,
    webhookStatus: "FAILED",
  });
  assert.equal(
    (
      await firestore.collection("refunds").doc(failedRefund.refundId).get()
    ).get("status"),
    "FAILED",
  );
  assert.equal(
    (
      await firestore.collection("returns").doc(failedRefund.returnId).get()
    ).get("status"),
    "RECEIVED",
    "Failed provider refund should leave return ready for retry",
  );

  const nextServer = spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL("../node_modules/next/dist/bin/next", import.meta.url),
      ),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3101",
    ],
    {
      cwd: fileURLToPath(new URL("../frontend", import.meta.url)),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  try {
    await waitForNextServer(nextServer);
    const [customerCookie, adminCookie] = await Promise.all([
      createSession(customer.token),
      createSession(admin.token),
    ]);
    const accountResponse = await fetch(`${appOrigin}/account`, {
      headers: { cookie: customerCookie },
    });
    const accountHtml = await accountResponse.text();
    assert.ok(
      accountResponse.ok &&
        accountHtml.includes("Request a return") &&
        accountHtml.includes("Return tracking") &&
        accountHtml.includes(policyVersion),
      `Account return UI did not render. Status ${
        accountResponse.status
      }. Body: ${accountHtml.slice(0, 800)}`,
    );

    const adminResponse = await fetch(
      `${appOrigin}/admin/returns?q=${encodeURIComponent(partialReturnId)}`,
      { headers: { cookie: adminCookie } },
    );
    const adminHtml = await adminResponse.text();
    assert.ok(
      adminResponse.ok &&
        adminHtml.includes("Eligible refund") &&
        adminHtml.includes("Condition") &&
        adminHtml.includes("Refund reason"),
      `Admin return UI did not render. Status ${
        adminResponse.status
      }. Body: ${adminHtml.slice(0, 800)}`,
    );
  } finally {
    await stopNextServer(nextServer);
  }

  const returnAudit = await firestore
    .collection("auditLogs")
    .where("targetId", "==", partialReturnId)
    .get();
  assert.ok(returnAudit.size >= 4, "Return audit trail is incomplete");

  console.log(
    "Phase 15 return flow passed policy retention, customer eligibility, partial/full returns, rejection, damaged receipt, idempotent inventory, refund caps, provider failure, notification idempotency, and UI rendering.",
  );
} finally {
  await deleteApp(app).catch(() => undefined);
}
