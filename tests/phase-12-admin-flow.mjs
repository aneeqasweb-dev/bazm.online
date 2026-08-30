import assert from "node:assert/strict";
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

async function account(role, label, permissions = []) {
  const email = `phase-12-${label}-${suffix}@example.test`;
  const signUp = await authRequest("accounts:signUp", {
    email,
    password,
    returnSecureToken: true,
  });
  assert.ok(signUp.response.ok && signUp.data.idToken && signUp.data.localId);
  const registration = await call("completeRegistration", signUp.data.idToken, {
    name: `Phase Twelve ${label}`,
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

function mediaAsset() {
  return {
    path: `products/phase-12-${suffix}/primary.webp`,
    url: "https://bazm.online/images/phase-12.webp",
    alt: "Phase twelve product image",
    width: 1200,
    height: 1500,
    contentType: "image/webp",
    contentHash: `phase12hash${suffix}`,
    sortOrder: 0,
  };
}

function address() {
  return {
    recipientName: "Phase Twelve Customer",
    phone: "+923001234567",
    line1: "12 Admin Road",
    line2: null,
    area: "Gulberg",
    city: "Lahore",
    province: "PUNJAB",
    postalCode: "54000",
    deliveryInstructions: null,
  };
}

async function seedProductReviewAndReturn(customer) {
  const now = Timestamp.now();
  const productId = `p12-product-${suffix}`;
  const orderId = `p12-order-${suffix}`;
  const reviewId = `p12-review-${suffix}`;
  const returnId = `p12-return-${suffix}`;
  await firestore
    .collection("products")
    .doc(productId)
    .set({
      name: "Phase Twelve Coat",
      slug: `phase-twelve-coat-${suffix}`,
      description:
        "A carefully tailored phase twelve coat used to verify admin moderation.",
      categoryId: `p12-category-${suffix}`,
      categoryPath: [`p12-category-${suffix}`],
      brand: "Bazm",
      basePrice: { amountMinor: 120_000, currency: "PKR" },
      media: [mediaAsset()],
      tags: ["phase-twelve"],
      searchTokens: ["phase", "twelve", "coat", "bazm"],
      ratingSummary: { average: 0, count: 0 },
      flags: { featured: false, newArrival: true },
      seo: { title: null, description: null },
      status: "PUBLISHED",
      publishedAt: now,
      archivedAt: null,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
  await firestore
    .collection("orders")
    .doc(orderId)
    .set({
      userId: customer.uid,
      status: "DELIVERED",
      items: [
        {
          productId,
          variantId: `p12-variant-${suffix}`,
          productName: "Phase Twelve Coat",
          sku: `P12-SKU-${suffix}`,
          color: "Black",
          size: "M",
          quantity: 1,
          unitPrice: { amountMinor: 120_000, currency: "PKR" },
          discountAmount: { amountMinor: 0, currency: "PKR" },
          taxAmount: { amountMinor: 0, currency: "PKR" },
          lineTotal: { amountMinor: 120_000, currency: "PKR" },
          media: mediaAsset(),
        },
      ],
      shippingAddress: address(),
      billingAddress: address(),
      totals: {
        subtotal: { amountMinor: 120_000, currency: "PKR" },
        discount: { amountMinor: 0, currency: "PKR" },
        shipping: { amountMinor: 0, currency: "PKR" },
        tax: { amountMinor: 0, currency: "PKR" },
        grandTotal: { amountMinor: 120_000, currency: "PKR" },
        currency: "PKR",
      },
      couponId: null,
      couponCode: null,
      paymentId: `p12-payment-${suffix}`,
      reservationId: null,
      checkoutIdempotencyKey: `p12-checkout-${suffix}`,
      paymentMethod: "CARD",
      trackingNumber: "TRK-P12",
      deliveryMethod: "STANDARD",
      policyVersion: "returns-14-days-v1",
      customerNote: null,
      adminNote: null,
      placedAt: now,
      archivedAt: null,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
  await firestore
    .collection("payments")
    .doc(`p12-payment-${suffix}`)
    .set({
      orderId,
      userId: customer.uid,
      provider: "SANDBOX",
      providerPaymentId: `provider-p12-${suffix}`,
      amount: { amountMinor: 120_000, currency: "PKR" },
      refundedAmount: { amountMinor: 0, currency: "PKR" },
      status: "PAID",
      idempotencyKey: `phase-12-payment-${suffix}`,
      failureCode: null,
      providerEventIds: [`phase-12-event-${suffix}`],
      paidAt: now,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
  await firestore.collection("reviews").doc(reviewId).set({
    productId,
    orderId,
    userId: customer.uid,
    rating: 5,
    title: "Beautiful coat",
    content: "Beautiful tailoring and exactly the admin test quality we need.",
    status: "PENDING",
    verifiedPurchase: true,
    moderationReason: null,
    archivedAt: null,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  });
  await firestore
    .collection("returns")
    .doc(returnId)
    .set({
      orderId,
      userId: customer.uid,
      items: [
        {
          orderItemId: `line-${suffix}`,
          productId,
          variantId: `p12-variant-${suffix}`,
          sku: `P12-SKU-${suffix}`,
          quantity: 1,
          reason: "Wrong size",
        },
      ],
      status: "REQUESTED",
      evidencePaths: [],
      customerNote: "Please exchange this.",
      staffNote: null,
      refundPaymentId: null,
      requestedAt: now,
      receivedAt: null,
      archivedAt: null,
      schemaVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
  return { orderId, productId, returnId, reviewId };
}

async function createSession(idToken) {
  const response = await fetch(`${appOrigin}/api/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: appOrigin },
    body: JSON.stringify({ idToken }),
  });
  const sessionCookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(response.ok && sessionCookie, "Admin web session failed");
  return sessionCookie;
}

async function assertRedirectsTo(response, expectedPath, label) {
  const location = response.headers.get("location");
  if (location) {
    assert.equal(new URL(location, appOrigin).pathname, expectedPath, label);
    return;
  }

  const html = await response.text();
  const streamedRedirect =
    html.includes("NEXT_REDIRECT") && html.includes(expectedPath);
  assert.ok(
    streamedRedirect,
    `${label}. Expected redirect to ${expectedPath}, got status ${
      response.status
    } with body: ${html.slice(0, 500)}`,
  );
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

try {
  const [customer, admin, catalogStaff, couponStaff, orderStaff, target] =
    await Promise.all([
      account("CUSTOMER", "customer"),
      account("ADMIN", "admin"),
      account("STAFF", "catalog-staff", ["catalog.manage"]),
      account("STAFF", "coupon-staff", ["coupons.manage"]),
      account("STAFF", "order-staff", ["orders.manage"]),
      account("CUSTOMER", "target"),
    ]);
  const seeded = await seedProductReviewAndReturn(customer);

  const customerCoupon = await call("createCoupon", customer.token, {
    code: `NOPE-${suffix}`,
    discount: { kind: "PERCENTAGE", percentage: 5 },
    minimumOrderAmount: null,
    maximumDiscountAmount: null,
    startsAt: new Date(Date.now() - 60_000).toISOString(),
    endsAt: new Date(Date.now() + 86_400_000).toISOString(),
    usageLimit: null,
    perCustomerLimit: null,
  });
  assert.equal(customerCoupon.response.ok, false, "Customer created a coupon");

  const wrongStaff = await call("updateReturnStatus", orderStaff.token, {
    returnId: seeded.returnId,
    status: "APPROVED",
    staffNote: "Reviewed by fulfilment",
    refundPaymentId: null,
  });
  assert.equal(
    wrongStaff.response.ok,
    false,
    "Staff without returns.manage updated a return",
  );

  const coupon = await call("createCoupon", couponStaff.token, {
    code: `P12-${suffix}`,
    discount: { kind: "PERCENTAGE", percentage: 12 },
    minimumOrderAmount: { amountMinor: 10_000, currency: "PKR" },
    maximumDiscountAmount: { amountMinor: 20_000, currency: "PKR" },
    startsAt: new Date(Date.now() - 60_000).toISOString(),
    endsAt: new Date(Date.now() + 86_400_000).toISOString(),
    usageLimit: 100,
    perCustomerLimit: 1,
  });
  assert.ok(
    coupon.response.ok && coupon.data.result?.id,
    "Coupon create failed",
  );
  const couponId = coupon.data.result.id;
  const activeCoupon = await call("setCouponStatus", couponStaff.token, {
    id: couponId,
    status: "ACTIVE",
  });
  assert.ok(activeCoupon.response.ok, "Coupon activation failed");

  const settingsOne = await call("upsertSettings", admin.token, {
    key: "commerce.tax",
    visibility: "PUBLIC",
    value: { rate: 0.15, label: "GST" },
    expectedRevision: null,
  });
  assert.equal(settingsOne.data.result?.revision, 1);
  const settingsTwo = await call("upsertSettings", admin.token, {
    key: "commerce.tax",
    visibility: "PUBLIC",
    value: { rate: 0.16, label: "GST" },
    expectedRevision: 1,
  });
  assert.equal(settingsTwo.data.result?.revision, 2);
  const staleSettings = await call("upsertSettings", admin.token, {
    key: "commerce.tax",
    visibility: "PUBLIC",
    value: { rate: 0.17, label: "GST" },
    expectedRevision: 1,
  });
  assert.equal(staleSettings.response.ok, false, "Stale settings saved");

  const moderated = await call("moderateReview", admin.token, {
    reviewId: seeded.reviewId,
    status: "PUBLISHED",
    moderationReason: null,
  });
  assert.ok(moderated.response.ok, "Review moderation failed");
  const product = await firestore
    .collection("products")
    .doc(seeded.productId)
    .get();
  assert.equal(product.get("ratingSummary.count"), 1);
  assert.equal(product.get("ratingSummary.average"), 5);

  const returnUpdate = await call("updateReturnStatus", admin.token, {
    returnId: seeded.returnId,
    status: "APPROVED",
    staffNote: "Return approved after policy review.",
    refundPaymentId: null,
  });
  assert.ok(returnUpdate.response.ok, "Return status update failed");
  assert.equal(
    (await firestore.collection("orders").doc(seeded.orderId).get()).get(
      "status",
    ),
    "RETURN_REQUESTED",
  );

  const userAccess = await call("updateUserAccess", admin.token, {
    userId: target.uid,
    role: "STAFF",
    isActive: true,
    permissions: ["orders.manage"],
  });
  assert.ok(userAccess.response.ok, "User access update failed");
  const targetClaims = (await auth.getUser(target.uid)).customClaims ?? {};
  assert.deepEqual(targetClaims.permissions, ["orders.manage"]);

  for (let index = 0; index < 26; index += 1) {
    await firestore
      .collection("settings")
      .doc(`phase12.setting${index}`)
      .set({
        key: `phase12.setting${index}`,
        visibility: "PRIVATE",
        value: { index },
        revision: 1,
        schemaVersion: 1,
        createdAt: Timestamp.fromMillis(Date.now() - index * 1_000),
        updatedAt: Timestamp.fromMillis(Date.now() - index * 1_000),
      });
  }
  const settingsSnapshot = await firestore.collection("settings").get();
  assert.ok(
    settingsSnapshot.size >= 27,
    `Expected at least 27 settings documents, found ${settingsSnapshot.size}`,
  );
  const settingsPageSnapshot = await firestore
    .collection("settings")
    .orderBy("updatedAt", "desc")
    .limit(26)
    .get();
  assert.equal(
    settingsPageSnapshot.size,
    26,
    "Settings pagination fixture did not produce a next page",
  );
  const settingsNextCursor = settingsPageSnapshot.docs.at(24)?.id;
  assert.ok(settingsNextCursor, "Settings pagination cursor was not created");

  const auditSnapshot = await firestore
    .collection("auditLogs")
    .where("actorId", "in", [admin.uid, couponStaff.uid])
    .get();
  assert.ok(
    auditSnapshot.size >= 5,
    "Phase 12 admin actions did not write audit logs",
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
    const [adminCookie, customerCookie, catalogStaffCookie, orderStaffCookie] =
      await Promise.all([
        createSession(admin.token),
        createSession(customer.token),
        createSession(catalogStaff.token),
        createSession(orderStaff.token),
      ]);

    const customerAdmin = await fetch(`${appOrigin}/admin`, {
      headers: { cookie: customerCookie },
      redirect: "manual",
    });
    await assertRedirectsTo(
      customerAdmin,
      "/unauthorized",
      "Customer could access admin shell",
    );

    const deniedOrders = await fetch(`${appOrigin}/admin/orders`, {
      headers: { cookie: catalogStaffCookie },
      redirect: "manual",
    });
    await assertRedirectsTo(
      deniedOrders,
      "/unauthorized",
      "Catalog staff could access orders module",
    );

    const allowedOrders = await fetch(`${appOrigin}/admin/orders`, {
      headers: { cookie: orderStaffCookie },
    });
    assert.ok(
      allowedOrders.ok && (await allowedOrders.text()).includes("Orders"),
      "Permissioned staff could not render orders",
    );

    for (const [path, marker] of [
      ["/admin", "Administration"],
      ["/admin/products", "Product management"],
      ["/admin/categories", "Category system"],
      ["/admin/inventory", "Inventory ledger"],
      ["/admin/orders", "Orders"],
      ["/admin/customers", "Customers and staff"],
      ["/admin/payments", "Payments"],
      ["/admin/coupons", "Coupons"],
      ["/admin/reviews", "Reviews"],
      ["/admin/returns", "Returns"],
      ["/admin/reports", "Reports"],
      ["/admin/settings", "Settings"],
      ["/admin/audit", "Audit logs"],
    ]) {
      const response = await fetch(`${appOrigin}${path}`, {
        headers: { cookie: adminCookie },
      });
      const html = await response.text();
      assert.ok(
        response.ok && html.includes(marker),
        `${path} did not render marker "${marker}". Status ${
          response.status
        }. Body: ${html.slice(0, 800)}`,
      );
    }

    const settingsCursorPage = await fetch(
      `${appOrigin}/admin/settings?after=${encodeURIComponent(
        settingsNextCursor,
      )}`,
      { headers: { cookie: adminCookie } },
    );
    const settingsCursorHtml = await settingsCursorPage.text();
    assert.ok(
      settingsCursorPage.ok && settingsCursorHtml.includes("Settings"),
      `Settings cursor page did not render. Status ${
        settingsCursorPage.status
      }. Body: ${settingsCursorHtml.slice(0, 800)}`,
    );
  } finally {
    await stopNextServer(nextServer);
  }

  console.log(
    "Phase 12 admin flow passed permissions, admin routes, pagination, coupons, reviews, returns, settings revisions, and audit logs.",
  );
} finally {
  await deleteApp(app).catch(() => undefined);
}
