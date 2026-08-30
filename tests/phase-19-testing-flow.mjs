import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";

const projectId = "demo-bazm-online";
const apiKey = "demo-api-key";
const authOrigin = "http://127.0.0.1:9099";
const functionsOrigin = `http://127.0.0.1:5001/${projectId}/asia-south1`;
const suffix = Date.now().toString();
const password = "Secure123";
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const app = getApps()[0] ?? initializeApp({ projectId });
const auth = getAuth(app);
const firestore = getFirestore(app);

function read(relativePath) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function pkr(amountMinor) {
  return { amountMinor, currency: "PKR" };
}

function storageUrl(path) {
  return `http://127.0.0.1:9199/v0/b/${projectId}.appspot.com/o/${encodeURIComponent(
    path,
  )}?alt=media`;
}

function mediaAsset(path, alt) {
  return {
    alt,
    contentHash: `phase19hash${suffix}${path.length}`,
    contentType: "image/webp",
    height: 1500,
    path,
    sortOrder: 0,
    url: storageUrl(path),
    width: 1200,
  };
}

function stamp(now = Timestamp.now()) {
  return {
    createdAt: now,
    schemaVersion: 1,
    updatedAt: now,
  };
}

function address() {
  return {
    area: "Gulberg",
    city: "Lahore",
    deliveryInstructions: null,
    line1: "19 Reliability Road",
    line2: null,
    phone: "+923001234567",
    postalCode: "54000",
    province: "PUNJAB",
    recipientName: "Phase Nineteen Customer",
  };
}

async function authRequest(endpoint, body) {
  const response = await fetch(
    `${authOrigin}/identitytoolkit.googleapis.com/v1/${endpoint}?key=${apiKey}`,
    {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  return { data: await response.json(), response };
}

async function refreshToken(refreshToken) {
  const response = await fetch(
    `${authOrigin}/securetoken.googleapis.com/v1/token?key=${apiKey}`,
    {
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    },
  );
  const data = await response.json();
  assert.ok(response.ok && data.id_token, "Token refresh failed");
  return data.id_token;
}

async function callFunction(name, idToken, data = {}) {
  const response = await fetch(`${functionsOrigin}/${name}`, {
    body: JSON.stringify({ data }),
    headers: {
      authorization: `Bearer ${idToken}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  return { data: await response.json(), response };
}

async function signedWebhook(name, payload) {
  const body = JSON.stringify(payload);
  const signature = createHmac("sha256", "emulator-payment-secret")
    .update(Buffer.from(body))
    .digest("hex");
  const response = await fetch(`${functionsOrigin}/${name}`, {
    body,
    headers: {
      "content-type": "application/json",
      "x-bazm-signature": signature,
    },
    method: "POST",
  });
  return { data: await response.json(), response };
}

async function account(role, label, permissions = []) {
  const email = `phase-19-${label}-${suffix}@example.test`;
  const signup = await authRequest("accounts:signUp", {
    email,
    password,
    returnSecureToken: true,
  });
  assert.ok(signup.response.ok && signup.data.idToken && signup.data.localId);
  assert.ok(
    (
      await callFunction("completeRegistration", signup.data.idToken, {
        name: `Phase Nineteen ${label}`,
      })
    ).response.ok,
    `${label} registration failed`,
  );
  await Promise.all([
    auth.updateUser(signup.data.localId, { emailVerified: true }),
    firestore.collection("users").doc(signup.data.localId).update({
      emailVerified: true,
      isActive: true,
      permissions,
      role,
      updatedAt: FieldValue.serverTimestamp(),
    }),
  ]);
  await auth.setCustomUserClaims(signup.data.localId, {
    claimsVersion: 1,
    isActive: true,
    role,
    ...(permissions.length ? { permissions } : {}),
  });
  return {
    token: await refreshToken(signup.data.refreshToken),
    uid: signup.data.localId,
  };
}

function assertStaticTestingPosture() {
  const packageJson = JSON.parse(read("package.json"));
  assert.ok(packageJson.scripts.test, "Root unit test script is missing");
  assert.ok(
    packageJson.scripts["test:e2e"]?.includes("playwright test"),
    "Playwright E2E script is missing",
  );
  assert.ok(
    packageJson.scripts["test:phase19"]?.includes("phase-19-testing-flow.mjs"),
    "Phase 19 gate script is missing",
  );
  assert.ok(
    packageJson.scripts.test?.includes("@bazm/domain") &&
      packageJson.scripts.test?.includes("frontend") &&
      packageJson.scripts.test?.includes("functions"),
    "Root unit test script must include domain, frontend, and functions",
  );
  assert.ok(
    packageJson.scripts["test:emulators"]?.includes("npm run test:phase19") ||
      packageJson.scripts["test:emulators"]?.includes(
        "phase-19-testing-flow.mjs",
      ),
    "Full emulator suite must include the Phase 19 reliability gate",
  );
  assert.ok(
    packageJson.scripts["test:emulators"]?.includes("npm run test:phase19") ||
      packageJson.scripts["test:emulators"]?.includes("npm run test:e2e"),
    "Full emulator suite must include Playwright E2E/a11y tests",
  );
  assert.ok(
    packageJson.devDependencies["@playwright/test"] &&
      packageJson.devDependencies["axe-core"],
    "Playwright and axe-core must be explicit dev dependencies",
  );

  const playwrightConfig = read("playwright.config.mjs");
  for (const expected of [
    "desktop-chromium",
    "mobile-chromium",
    "test-results/playwright-report",
    "test-results/playwright-results.json",
    "forbidOnly: true",
    "next start",
    "NEXT_PUBLIC_USE_FIREBASE_EMULATORS",
  ]) {
    assert.ok(
      playwrightConfig.includes(expected),
      `Playwright config is missing ${expected}`,
    );
  }

  const e2e = read("tests/e2e/phase-19-journeys.spec.mjs");
  for (const expected of [
    "axe-core/axe.min.js",
    "assertNoCriticalA11yViolations",
    "expectKeyboardReachable",
    "createReview",
    "moderateReview",
    "initiateRefund",
    "refundWebhook",
    "setOffline(true)",
    "page.route",
  ]) {
    assert.ok(e2e.includes(expected), `E2E test is missing ${expected}`);
  }

  const domainTests = read("packages/domain/src/phase-19-contracts.test.ts");
  for (const expected of [
    "moneySchema",
    "couponDiscountSchema",
    "inventoryReservationDocumentSchema",
    "orderDocumentSchema",
    "paymentWebhookEventSchema",
    "returnPolicySchema",
  ]) {
    assert.ok(
      domainTests.includes(expected),
      `Domain Phase 19 tests are missing ${expected}`,
    );
  }

  const functionTests = read(
    "functions/src/phase-19-command-contracts.test.ts",
  );
  for (const expected of [
    "reserveInventoryCommandSchema",
    "checkoutCommandSchema",
    "isAllowedOrderTransition",
    "isAllowedReturnTransition",
    "updateReturnStatusCommandSchema",
  ]) {
    assert.ok(
      functionTests.includes(expected),
      `Function Phase 19 tests are missing ${expected}`,
    );
  }

  const strategyPath = join(repoRoot, "docs/testing-strategy.md");
  assert.ok(existsSync(strategyPath), "Testing strategy document is missing");
  const strategy = read("docs/testing-strategy.md");
  for (const expected of [
    "Defect severity",
    "Regression suite",
    "Fixture and seed strategy",
    "Test report format",
    "No secrets",
    "Keyboard and screen-reader manual scripts",
  ]) {
    assert.ok(
      strategy.includes(expected),
      `Testing strategy is missing ${expected}`,
    );
  }
}

async function seedCheckoutFixture(customer) {
  const now = Timestamp.now();
  const categoryId = `p19-category-${suffix}`;
  const productId = `p19-product-${suffix}`;
  const variantId = `p19-variant-${suffix}`;
  const sku = `P19-SKU-${suffix}`;
  const slug = `phase-nineteen-reliability-${suffix}`;
  const couponCode = `P19SAVE${suffix.slice(-8)}`;
  const couponId = `p19-coupon-${suffix}`;
  const addressId = `p19-address-${suffix}`;
  const image = mediaAsset(
    `products/phase-19/${suffix}/primary.webp`,
    "Phase nineteen reliability product",
  );
  const snapshot = {
    brand: "Bazm",
    color: "Black",
    image,
    name: "Phase Nineteen Reliability Kurta",
    price: pkr(50_000),
    size: "M",
    sku,
    slug,
  };

  await Promise.all([
    firestore
      .collection("categories")
      .doc(categoryId)
      .set({
        archivedAt: null,
        depth: 0,
        image: null,
        name: "Phase Nineteen Reliability",
        parentId: null,
        seo: { description: null, title: null },
        slug: `phase-nineteen-reliability-${suffix}`,
        sortOrder: 0,
        status: "ACTIVE",
        ...stamp(now),
      }),
    firestore.collection("slugRegistry").doc(`product_${slug}`).set({
      createdAt: now,
      ownerId: productId,
      slug,
      type: "PRODUCT",
    }),
    firestore
      .collection("products")
      .doc(productId)
      .set({
        archivedAt: null,
        basePrice: pkr(50_000),
        brand: "Bazm",
        categoryId,
        categoryPath: [categoryId],
        description:
          "A deterministic Phase 19 product for retry, duplicate, and consistency testing.",
        flags: { featured: false, newArrival: true },
        media: [image],
        name: snapshot.name,
        publishedAt: now,
        ratingSummary: { average: 0, count: 0 },
        searchTokens: ["phase", "nineteen", "reliability", "kurta", "bazm"],
        seo: { description: null, title: null },
        slug,
        status: "PUBLISHED",
        tags: ["phase-nineteen"],
        ...stamp(now),
      }),
    firestore
      .collection("products")
      .doc(productId)
      .collection("variants")
      .doc(variantId)
      .set({
        color: snapshot.color,
        isActive: true,
        media: [],
        priceOverride: null,
        productId,
        size: snapshot.size,
        sku,
        ...stamp(now),
      }),
    firestore.collection("inventory").doc(sku).set({
      available: 4,
      damaged: 0,
      productId,
      reorderPoint: 0,
      reserved: 0,
      reservedUntil: null,
      returned: 0,
      schemaVersion: 1,
      sku,
      sold: 0,
      updatedAt: now,
      variantId,
      createdAt: now,
    }),
    firestore
      .collection("coupons")
      .doc(couponId)
      .set({
        archivedAt: null,
        codeHash: createHash("sha256").update(couponCode).digest("hex"),
        displayCode: couponCode,
        discount: { kind: "PERCENTAGE", percentage: 10 },
        endsAt: Timestamp.fromMillis(now.toMillis() + 86_400_000),
        maximumDiscountAmount: pkr(10_000),
        minimumOrderAmount: pkr(40_000),
        perCustomerLimit: 1,
        redemptionCount: 0,
        startsAt: Timestamp.fromMillis(now.toMillis() - 86_400_000),
        status: "ACTIVE",
        usageLimit: 1,
        ...stamp(now),
      }),
    firestore
      .collection("users")
      .doc(customer.uid)
      .collection("addresses")
      .doc(addressId)
      .set({
        label: "Home",
        ...address(),
        ...stamp(now),
      }),
    firestore
      .collection("carts")
      .doc(customer.uid)
      .set({
        currency: "PKR",
        expiresAt: Timestamp.fromMillis(now.toMillis() + 30 * 86_400_000),
        userId: customer.uid,
        ...stamp(now),
      }),
    firestore
      .collection("carts")
      .doc(customer.uid)
      .collection("items")
      .doc(variantId)
      .set({
        productId,
        requestedQuantity: 1,
        snapshot,
        variantId,
        ...stamp(now),
      }),
  ]);

  return {
    addressId,
    couponCode,
    couponId,
    sku,
    variantId,
  };
}

async function assertConcurrentReservation(customer) {
  const now = Timestamp.now();
  const sku = `P19-LAST-${suffix}`;
  await firestore
    .collection("inventory")
    .doc(sku)
    .set({
      available: 1,
      createdAt: now,
      damaged: 0,
      productId: `p19-last-product-${suffix}`,
      reorderPoint: 0,
      reserved: 0,
      reservedUntil: null,
      returned: 0,
      schemaVersion: 1,
      sku,
      sold: 0,
      updatedAt: now,
      variantId: `p19-last-variant-${suffix}`,
    });

  const firstKey = `p19ReserveA${suffix}`;
  const secondKey = `p19ReserveB${suffix}`;
  const [first, second] = await Promise.all([
    callFunction("reserveInventory", customer.token, {
      idempotencyKey: firstKey,
      lines: [{ quantity: 1, sku }],
    }),
    callFunction("reserveInventory", customer.token, {
      idempotencyKey: secondKey,
      lines: [{ quantity: 1, sku }],
    }),
  ]);

  const successful = [first, second].filter((result) => result.response.ok);
  assert.equal(successful.length, 1, "Last-item reservation was not exclusive");
  const retry = await callFunction("reserveInventory", customer.token, {
    idempotencyKey: successful[0] === first ? firstKey : secondKey,
    lines: [{ quantity: 1, sku }],
  });
  assert.equal(
    retry.data.result.idempotent,
    true,
    "Reservation retry duplicated stock movement",
  );
  const inventory = await firestore.collection("inventory").doc(sku).get();
  assert.equal(inventory.get("available"), 0);
  assert.equal(inventory.get("reserved"), 1);
}

async function assertCheckoutRetryAndWebhookConsistency(customer, admin) {
  const fixture = await seedCheckoutFixture(customer);
  const checkoutInput = {
    billingAddressId: null,
    couponCode: fixture.couponCode,
    customerNote: null,
    deliveryMethod: "STANDARD",
    idempotencyKey: `p19Checkout${suffix}`,
    shippingAddressId: fixture.addressId,
  };

  const [first, second] = await Promise.all([
    callFunction("createCheckout", customer.token, checkoutInput),
    callFunction("createCheckout", customer.token, checkoutInput),
  ]);
  assert.ok(first.response.ok, `First checkout failed: ${first.data}`);
  assert.ok(second.response.ok, `Second checkout failed: ${second.data}`);
  assert.equal(
    first.data.result.orderId,
    second.data.result.orderId,
    "Concurrent checkout did not collapse to one order",
  );

  const retry = await callFunction(
    "createCheckout",
    customer.token,
    checkoutInput,
  );
  assert.equal(
    retry.data.result.orderId,
    first.data.result.orderId,
    "Checkout retry did not return the existing order",
  );
  assert.equal(
    retry.data.result.idempotent,
    true,
    "Checkout retry was not marked idempotent",
  );

  const orderRef = firestore
    .collection("orders")
    .doc(first.data.result.orderId);
  const orderSnapshot = await orderRef.get();
  assert.equal(orderSnapshot.get("couponCode"), fixture.couponCode);
  assert.equal(orderSnapshot.get("totals.discount.amountMinor"), 5_000);
  assert.equal(
    (
      await firestore
        .collection("orders")
        .where("checkoutIdempotencyKey", "==", checkoutInput.idempotencyKey)
        .get()
    ).size,
    1,
    "Checkout retry created duplicate orders",
  );
  assert.equal(
    (await orderRef.collection("items").get()).size,
    0,
    "Orders must not have mutable item subcollections",
  );
  assert.equal(
    (
      await firestore
        .collection("couponRedemptions")
        .where("couponId", "==", fixture.couponId)
        .where("userId", "==", customer.uid)
        .get()
    ).size,
    1,
    "Coupon retry created duplicate redemptions",
  );
  assert.equal(
    (await firestore.collection("coupons").doc(fixture.couponId).get()).get(
      "redemptionCount",
    ),
    1,
    "Coupon redemption count was not idempotent",
  );
  assert.equal(
    (
      await firestore
        .collection("carts")
        .doc(customer.uid)
        .collection("items")
        .get()
    ).empty,
    true,
    "Checkout did not clear cart items",
  );

  const emptyCartCheckout = await callFunction(
    "createCheckout",
    customer.token,
    {
      ...checkoutInput,
      idempotencyKey: `p19EmptyCart${suffix}`,
    },
  );
  assert.equal(
    emptyCartCheckout.response.ok,
    false,
    "Empty cart checkout was accepted",
  );

  const paymentId = orderSnapshot.get("paymentId");
  const paymentEvent = {
    amountMinor: orderSnapshot.get("totals.grandTotal.amountMinor"),
    currency: "PKR",
    eventId: `p19-payment-${suffix}`,
    occurredAt: new Date().toISOString(),
    paymentId,
    providerPaymentId: `sandbox-${paymentId}`,
    status: "PAID",
  };
  const stalePayment = await signedWebhook("paymentWebhook", {
    ...paymentEvent,
    eventId: `p19-stale-payment-${suffix}`,
    occurredAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
  });
  assert.equal(stalePayment.response.ok, false, "Stale payment was accepted");

  const paid = await signedWebhook("paymentWebhook", paymentEvent);
  assert.ok(paid.response.ok, `Payment webhook failed: ${paid.data}`);
  assert.equal(paid.data.duplicate, false);
  const replay = await signedWebhook("paymentWebhook", paymentEvent);
  assert.ok(replay.response.ok, `Payment replay failed: ${replay.data}`);
  assert.equal(replay.data.duplicate, true);
  assert.equal((await orderRef.get()).get("status"), "PAID");
  assert.equal(
    (await firestore.collection("payments").doc(paymentId).get()).get(
      "providerEventIds",
    ).length,
    1,
    "Payment replay appended duplicate provider event IDs",
  );
  const inventory = await firestore
    .collection("inventory")
    .doc(fixture.sku)
    .get();
  assert.equal(inventory.get("available"), 3);
  assert.equal(inventory.get("reserved"), 0);
  assert.equal(inventory.get("sold"), 1);

  const refund = await callFunction("initiateRefund", admin.token, {
    amount: pkr(25_000),
    idempotencyKey: `p19Refund${suffix}`,
    paymentId,
    reason: "Phase 19 duplicate refund check",
    returnId: null,
  });
  assert.ok(refund.response.ok, `Refund initiation failed: ${refund.data}`);
  const refundEvent = {
    eventId: `p19-refund-${suffix}`,
    refundId: refund.data.result.refundId,
    status: "SUCCEEDED",
  };
  const refunded = await signedWebhook("refundWebhook", refundEvent);
  assert.ok(refunded.response.ok, `Refund webhook failed: ${refunded.data}`);
  assert.equal(refunded.data.duplicate, false);
  const refundReplay = await signedWebhook("refundWebhook", refundEvent);
  assert.ok(
    refundReplay.response.ok,
    `Refund replay failed: ${refundReplay.data}`,
  );
  assert.equal(refundReplay.data.duplicate, true);
  const payment = await firestore.collection("payments").doc(paymentId).get();
  assert.equal(payment.get("status"), "PARTIALLY_REFUNDED");
  assert.equal(payment.get("refundedAmount.amountMinor"), 25_000);
}

try {
  assertStaticTestingPosture();
  const [customer, admin] = await Promise.all([
    account("CUSTOMER", "customer"),
    account("SUPER_ADMIN", "admin"),
  ]);
  await assertConcurrentReservation(customer);
  await assertCheckoutRetryAndWebhookConsistency(customer, admin);
  console.log(
    "Phase 19 testing flow passed deterministic coverage posture, concurrency, idempotent retries, duplicate webhook, refund consistency, empty-state, slow/offline, a11y, and report-strategy checks.",
  );
} finally {
  await Promise.all(getApps().map((candidate) => deleteApp(candidate)));
}
