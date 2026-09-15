import { expect, test } from "@playwright/test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const projectId =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-bazm-online";
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "demo-api-key";
const authOrigin = "http://127.0.0.1:9099";
const functionsOrigin = `http://127.0.0.1:5001/${projectId}/asia-south1`;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3119";
const password = "Secure123";

process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8081";
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199";

const app = getApps()[0] ?? initializeApp({ projectId });
const auth = getAuth(app);
const firestore = getFirestore(app);
const storage = getStorage(app);
const pixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

let fixture;

function pkr(amountMinor) {
  return { amountMinor, currency: "PKR" };
}

function safeSuffix(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .slice(0, 70);
}

function skuSuffix(value) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, "-")
    .slice(0, 50);
}

function storageUrl(path) {
  return `http://127.0.0.1:9199/v0/b/${projectId}.appspot.com/o/${encodeURIComponent(
    path,
  )}?alt=media`;
}

function mediaAsset(path, alt) {
  return {
    alt,
    contentHash: `phase19imagehash${path.length}`,
    contentType: "image/png",
    height: 1500,
    path,
    sortOrder: 0,
    url: storageUrl(path),
    width: 1200,
  };
}

function address() {
  return {
    area: "Gulberg",
    city: "Lahore",
    deliveryInstructions: null,
    line1: "19 Testing Road",
    line2: null,
    phone: "+923001234567",
    postalCode: "54000",
    province: "PUNJAB",
    recipientName: "Phase Nineteen Customer",
  };
}

function stamp(now) {
  return {
    createdAt: now,
    schemaVersion: 1,
    updatedAt: now,
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

function assertCallableOk(result, message) {
  assert.ok(
    result.response.ok && result.data.result?.ok,
    `${message}: ${JSON.stringify(result.data)}`,
  );
}

async function account(role, label, permissions = []) {
  const email = `phase-19-${safeSuffix(label)}-${Date.now()}@example.test`;
  const signUp = await authRequest("accounts:signUp", {
    email,
    password,
    returnSecureToken: true,
  });
  assert.ok(signUp.response.ok && signUp.data.idToken && signUp.data.localId);

  const registration = await callFunction(
    "completeRegistration",
    signUp.data.idToken,
    { name: `Phase Nineteen ${label}` },
  );
  assertCallableOk(registration, `${label} registration failed`);

  await Promise.all([
    auth.updateUser(signUp.data.localId, { emailVerified: true }),
    firestore.collection("users").doc(signUp.data.localId).update({
      emailVerified: true,
      isActive: true,
      permissions,
      role,
      updatedAt: FieldValue.serverTimestamp(),
    }),
  ]);
  await auth.setCustomUserClaims(signUp.data.localId, {
    claimsVersion: 1,
    isActive: true,
    role,
    ...(permissions.length ? { permissions } : {}),
  });

  return {
    email,
    token: await refreshToken(signUp.data.refreshToken),
    uid: signUp.data.localId,
  };
}

async function createSession(page, idToken) {
  const response = await page.request.post(`${baseURL}/api/auth/session`, {
    data: { idToken },
    headers: { origin: baseURL },
  });
  expect(response.ok()).toBeTruthy();
  await expect(response).toBeOK();
  expect(await response.json()).toEqual({ ok: true });
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

async function assertNoCriticalA11yViolations(page, label) {
  await page.addScriptTag({ content: axeSource });
  const results = await page.evaluate(async () =>
    window.axe.run(document, {
      resultTypes: ["violations"],
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
      },
    }),
  );
  const critical = results.violations
    .filter((violation) => violation.impact === "critical")
    .map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => node.target.join(" ")).slice(0, 5),
    }));
  expect(critical, `${label} critical accessibility violations`).toEqual([]);
}

async function expectKeyboardReachable(page, locator, label) {
  await page.keyboard.press("Home");
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (
      (await locator.evaluate(
        (element) => element === document.activeElement,
      )) === true
    ) {
      await expect(locator, `${label} focused by keyboard`).toBeFocused();
      return;
    }
    await page.keyboard.press("Tab");
  }
  throw new Error(`${label} was not reachable with keyboard Tab navigation.`);
}

async function seedFixture(projectName) {
  const suffix = safeSuffix(`${Date.now()}-${projectName}`);
  const skuId = `P19-E2E-${skuSuffix(suffix)}`;
  const now = Timestamp.now();
  const [customer, admin] = await Promise.all([
    account("CUSTOMER", `customer-${suffix}`),
    account("SUPER_ADMIN", `admin-${suffix}`),
  ]);
  const categoryId = `p19-category-${suffix}`;
  const productId = `p19-product-${suffix}`;
  const variantId = `p19-variant-${suffix}`;
  const orderId = `p19-order-${suffix}`;
  const paymentId = `p19-payment-${suffix}`;
  const returnId = `p19-return-${suffix}`;
  const productSlug = `phase-nineteen-e2e-${suffix}`;
  const categorySlug = `phase-nineteen-category-${suffix}`;
  const productName = "Phase Nineteen Journey Kurta";
  const image = mediaAsset(
    `products/${productId}/primary.png`,
    "Phase nineteen journey kurta",
  );
  const orderLine = {
    color: "Ivory",
    discountAmount: pkr(0),
    lineTotal: pkr(125_000),
    media: image,
    productId,
    productName,
    quantity: 1,
    size: "M",
    sku: skuId,
    taxAmount: pkr(0),
    unitPrice: pkr(125_000),
    variantId,
  };

  await Promise.all([
    storage.bucket(`${projectId}.appspot.com`).file(image.path).save(pixelPng, {
      contentType: image.contentType,
    }),
    firestore
      .collection("categories")
      .doc(categoryId)
      .set({
        archivedAt: null,
        depth: 0,
        image: null,
        name: "Phase Nineteen Category",
        parentId: null,
        seo: { description: null, title: null },
        slug: categorySlug,
        sortOrder: 0,
        status: "ACTIVE",
        ...stamp(now),
      }),
    firestore.collection("slugRegistry").doc(`category_${categorySlug}`).set({
      createdAt: now,
      ownerId: categoryId,
      slug: categorySlug,
      type: "CATEGORY",
    }),
    firestore
      .collection("products")
      .doc(productId)
      .set({
        archivedAt: null,
        basePrice: pkr(125_000),
        brand: "Bazm",
        categoryId,
        categoryPath: [categoryId],
        description:
          "A phase nineteen journey product used for desktop and mobile Playwright testing.",
        flags: { featured: true, newArrival: true },
        media: [image],
        name: productName,
        publishedAt: now,
        ratingSummary: { average: 0, count: 0 },
        searchTokens: ["phase", "nineteen", "journey", "kurta", "bazm"],
        seo: {
          description:
            "Phase nineteen journey product for deterministic testing.",
          title: "Phase Nineteen Journey Kurta",
        },
        slug: productSlug,
        status: "PUBLISHED",
        tags: ["phase-nineteen", "kurta"],
        ...stamp(now),
      }),
    firestore.collection("slugRegistry").doc(`product_${productSlug}`).set({
      createdAt: now,
      ownerId: productId,
      slug: productSlug,
      type: "PRODUCT",
    }),
    firestore
      .collection("products")
      .doc(productId)
      .collection("variants")
      .doc(variantId)
      .set({
        color: "Ivory",
        isActive: true,
        media: [],
        priceOverride: null,
        productId,
        size: "M",
        sku: skuId,
        ...stamp(now),
      }),
    firestore.collection("inventory").doc(skuId).set({
      available: 4,
      damaged: 0,
      productId,
      reorderPoint: 0,
      reserved: 0,
      reservedUntil: null,
      returned: 0,
      sku: skuId,
      sold: 1,
      updatedAt: now,
      variantId,
      createdAt: now,
      schemaVersion: 1,
    }),
    firestore
      .collection("orders")
      .doc(orderId)
      .set({
        adminNote: null,
        archivedAt: null,
        billingAddress: address(),
        checkoutIdempotencyKey: `phase19-order-${suffix}`,
        couponCode: null,
        couponId: null,
        createdAt: now,
        customerNote: null,
        deliveryMethod: "STANDARD",
        items: [orderLine],
        paymentId,
        paymentMethod: "CARD",
        placedAt: now,
        policyVersion: "2026-08",
        reservationId: null,
        schemaVersion: 1,
        shippingAddress: address(),
        status: "DELIVERED",
        totals: {
          currency: "PKR",
          discount: pkr(0),
          grandTotal: pkr(125_000),
          shipping: pkr(0),
          subtotal: pkr(125_000),
          tax: pkr(0),
        },
        trackingNumber: "TRK-P19-E2E",
        updatedAt: now,
        userId: customer.uid,
      }),
    firestore
      .collection("payments")
      .doc(paymentId)
      .set({
        amount: pkr(125_000),
        createdAt: now,
        failureCode: null,
        idempotencyKey: `phase19-payment-${suffix}`,
        orderId,
        paidAt: now,
        provider: "SANDBOX",
        providerEventIds: [`phase19-paid-${suffix}`],
        providerPaymentId: `sandbox-${paymentId}`,
        refundedAmount: pkr(0),
        schemaVersion: 1,
        status: "PAID",
        updatedAt: now,
        userId: customer.uid,
      }),
    firestore
      .collection("returns")
      .doc(returnId)
      .set({
        approvedAt: now,
        archivedAt: null,
        condition: "RESELLABLE",
        createdAt: now,
        customerNote: "Testing refund journey.",
        evidencePaths: [],
        items: [
          {
            orderItemId: variantId,
            productId,
            quantity: 1,
            reason: "Wrong size",
            sku: skuId,
            variantId,
          },
        ],
        orderId,
        policyVersion: "returns-14-days-v1",
        receivedAt: now,
        refundAmount: pkr(125_000),
        refundId: null,
        refundPaymentId: null,
        refundedAt: null,
        rejectedAt: null,
        requestedAt: now,
        restoreResellableStock: true,
        restockingFee: pkr(0),
        returnWindowEndsAt: Timestamp.fromMillis(
          now.toMillis() + 14 * 86_400_000,
        ),
        schemaVersion: 1,
        staffNote: "Received by Phase 19 fixture.",
        status: "RECEIVED",
        updatedAt: now,
        userId: customer.uid,
      }),
  ]);

  return {
    admin,
    customer,
    orderId,
    paymentId,
    productId,
    productName,
    productSlug,
    returnId,
    variantId,
  };
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({}, testInfo) => {
  assert.equal(
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS ?? "true",
    "true",
    "Phase 19 E2E must run against Firebase emulators.",
  );
  fixture = await seedFixture(testInfo.project.name);
});

test("customer registration through delivered review journey is accessible", async ({
  page,
}) => {
  await createSession(page, fixture.customer.token);

  await page.goto("/account");
  await expect(
    page.getByRole("heading", { name: "Your account" }),
  ).toBeVisible();
  await expect(page.getByText(fixture.customer.email)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: fixture.productName }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit review" }),
  ).toBeVisible();
  await assertNoCriticalA11yViolations(page, "customer account");
  await expectKeyboardReachable(
    page,
    page.getByRole("button", { name: "Submit review" }).first(),
    "review submit button",
  );

  const created = await callFunction("createReview", fixture.customer.token, {
    content:
      "The fit, fabric, and delivery were all excellent in the Phase 19 journey.",
    images: [],
    orderId: fixture.orderId,
    productId: fixture.productId,
    rating: 5,
    title: "Phase 19 verified review",
    variantId: fixture.variantId,
  });
  assertCallableOk(created, "Review submission failed");
  const reviewId = created.data.result.id;

  const moderation = await callFunction("moderateReview", fixture.admin.token, {
    moderationReason: null,
    reviewId,
    status: "PUBLISHED",
  });
  assertCallableOk(moderation, "Review moderation failed");

  await page.goto(`/product/${fixture.productSlug}`);
  await expect(
    page.getByRole("heading", { name: fixture.productName }),
  ).toBeVisible();
  await expect(page.getByText("Phase 19 verified review")).toBeVisible();
  await expect(
    page.getByText("The fit, fabric, and delivery were all excellent"),
  ).toBeVisible();
  await assertNoCriticalA11yViolations(page, "published product review");
});

test("admin product through refund journey is accessible", async ({ page }) => {
  await createSession(page, fixture.admin.token);

  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Administration" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { exact: true, name: "Products" }),
  ).toBeVisible();
  await assertNoCriticalA11yViolations(page, "admin dashboard");
  await expectKeyboardReachable(
    page,
    page.getByRole("link", { exact: true, name: "Products" }),
    "products module",
  );

  await page.goto(`/admin/products`);
  await expect(
    page.getByRole("heading", { name: "Product management" }),
  ).toBeVisible();
  await expect(
    page.getByRole("table").getByText(fixture.productName).first(),
  ).toBeVisible();

  const refund = await callFunction("initiateRefund", fixture.admin.token, {
    amount: pkr(125_000),
    idempotencyKey: `p19refund${Date.now()}`,
    paymentId: fixture.paymentId,
    reason: "Approved Phase 19 return refund.",
    returnId: fixture.returnId,
  });
  assertCallableOk(refund, "Refund initiation failed");
  const refundId = refund.data.result.refundId;
  const webhook = await signedWebhook("refundWebhook", {
    eventId: `p19-refund-${Date.now()}`,
    refundId,
    status: "SUCCEEDED",
  });
  assert.ok(webhook.response.ok, `Refund webhook failed: ${webhook.data}`);

  await page.goto(`/admin/returns?q=${fixture.returnId}`);
  await expect(page.getByRole("heading", { name: "Returns" })).toBeVisible();
  await expect(page.getByText(fixture.returnId)).toBeVisible();
  await expect(page.getByText(`Refund ${refundId}`)).toBeVisible();

  await page.goto(`/admin/payments?q=${fixture.paymentId}`);
  await expect(page.getByRole("heading", { name: "Payments" })).toBeVisible();
  await expect(
    page.getByText(`sandbox-${fixture.paymentId}`, { exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-refunded-minor="125000"]')).toBeVisible();
  await assertNoCriticalA11yViolations(page, "admin refund pages");
});

test("empty, slow, and offline customer states stay keyboard operable", async ({
  page,
}) => {
  await page.route("**/shop?**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    await route.continue();
  });
  await page.goto(`/shop?q=phase19-no-results-${Date.now()}`);
  await expect(page.getByRole("heading", { name: "Shop Bazm" })).toBeVisible();
  await expect(page.getByText("No pieces match these filters.")).toBeVisible();
  await assertNoCriticalA11yViolations(page, "empty slow shop state");
  await expectKeyboardReachable(
    page,
    page.getByRole("button", { name: "Apply filters" }),
    "shop filter submit button",
  );

  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Shop the collection" }),
  ).toBeVisible();
  await page.context().setOffline(true);
  await page
    .getByRole("link", { name: "Shop the collection" })
    .click({ timeout: 2_000 })
    .catch(() => undefined);
  await expect(
    page.getByRole("heading", {
      name: "A new gathering of contemporary style.",
    }),
  ).toBeVisible();
  await page.context().setOffline(false);
  await page.getByRole("link", { name: "Shop the collection" }).click();
  await expect(page).toHaveURL(/\/shop/);
});
