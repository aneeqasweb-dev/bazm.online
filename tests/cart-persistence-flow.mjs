import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { chromium, expect as baseExpect } from "@playwright/test";

const expect = baseExpect.configure({ timeout: 30000 });

const base = process.env.CART_TEST_BASE_URL ?? "http://127.0.0.1:3140";
assert.ok(
  ["127.0.0.1", "localhost"].includes(new URL(base).hostname),
  "Use a local app server.",
);
for (const name of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"])
  assert.match(
    process.env[name] ?? "",
    /^(127\.0\.0\.1|localhost):\d+$/,
    "Use local Firebase emulators.",
  );
const app = initializeApp(
  { projectId: "demo-bazm-cart" },
  `cart-test-${Date.now()}`,
);
const db = getFirestore(app),
  auth = getAuth(app);
const suffix = Date.now().toString(),
  productId = `cart-demo-${suffix}`,
  variantId = `cart-demo-${suffix}-m`,
  sku = `CART-${suffix}`;
const stamp = () => ({
  schemaVersion: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
});
const productName = "Cart Persistence Linen Shirt";
const media = {
  path: `products/${productId}/image.webp`,
  url: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
  alt: "Demo linen shirt",
  width: 1200,
  height: 1600,
  contentType: "image/webp",
  contentHash: "a".repeat(64),
  sortOrder: 0,
};
const price = { amountMinor: 450000, currency: "PKR" };
let browser;
try {
  await db
    .collection("products")
    .doc(productId)
    .create({
      name: productName,
      slug: productId,
      description:
        "A demo shirt used to verify that your shopping bag is saved correctly.",
      categoryId: "demo-category",
      categoryPath: ["demo-category"],
      brand: "Bazm",
      basePrice: price,
      media: [media],
      tags: ["linen"],
      searchTokens: ["linen"],
      ratingSummary: { average: 0, count: 0 },
      flags: { featured: false, newArrival: false },
      seo: { title: null, description: null },
      status: "PUBLISHED",
      publishedAt: new Date(),
      archivedAt: null,
      ...stamp(),
    });
  await db
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
  await db
    .collection("inventory")
    .doc(sku)
    .create({
      sku,
      productId,
      variantId,
      available: 30,
      reserved: 0,
      sold: 0,
      returned: 0,
      damaged: 0,
      reorderPoint: 0,
      reservedUntil: null,
      ...stamp(),
    });
  await db
    .collection("slugRegistry")
    .doc(`product_${productId}`)
    .set({ ownerId: productId });
  browser = await chromium.launch();
  const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    page = await context.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(`${base}/product/${productId}`);
  await expect(
    page.getByRole("heading", { name: productName, exact: true, level: 1 }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Decline analytics" }).click();
  await page
    .getByRole("link", { name: "Write a review", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(`${base}/product/${productId}/review`);
  await expect(
    page.getByRole("link", { name: "Sign in to review", exact: true }),
  ).toHaveAttribute("href", `/login?next=%2Fproduct%2F${productId}%2Freview`);
  await page
    .getByRole("link", { name: `← Back to ${productName}`, exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Buy it now", exact: true }),
  ).toBeEnabled();
  mkdirSync("test-results/cart", { recursive: true });
  await page.getByLabel("Quantity", { exact: true }).fill("2");
  await page.screenshot({
    path: "test-results/cart/buy-now-product.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Buy it now", exact: true }).click();
  await expect(page).toHaveURL(`${base}/checkout`);
  await expect(
    page.getByRole("heading", { name: "How would you like to pay?" }),
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: /Easypaisa/ })).toBeChecked();
  await page.getByRole("radio", { name: /JazzCash/ }).check();
  await expect(
    page.getByRole("heading", { name: "JazzCash wallet" }),
  ).toBeVisible();
  await page.getByRole("radio", { name: /Credit.*debit card/ }).check();
  await expect(page.getByLabel("Card number", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Sign in to pay" }).first(),
  ).toHaveAttribute("href", "/login?next=/checkout");
  await page.screenshot({
    path: "test-results/cart/guest-payment-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await page.screenshot({
    path: "test-results/cart/guest-payment-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("link", { name: "Return to shopping bag" }).click();
  await expect(page).toHaveURL(`${base}/cart`);
  await expect(
    page.getByRole("link", { name: productName, exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Quantity", { exact: true })).toHaveValue("2");
  await expect(
    page.getByRole("link", { name: "Continue to checkout" }),
  ).toBeVisible();
  const cookie = (await context.cookies()).find(
    (c) => c.name === "bazm_guest_cart",
  );
  assert.ok(cookie?.httpOnly);
  assert.match(cookie.value, /^[a-f0-9]{64}$/);
  const guestRef = db
    .collection("guestCarts")
    .doc(cookie.value)
    .collection("items")
    .doc(variantId);
  assert.equal((await guestRef.get()).get("requestedQuantity"), 2);
  await page.reload();
  await expect(page.getByLabel("Quantity", { exact: true })).toHaveValue("2");
  await page.goto(`${base}/product/${productId}`);
  await page
    .getByRole("button", { name: "Add 1 to cart", exact: true })
    .click();
  await expect(page).toHaveURL(`${base}/cart`);
  await expect(page.getByLabel("Quantity", { exact: true })).toHaveValue("3");
  const concurrent = await Promise.all(
    [1, 2].map(() =>
      context.request.post(`${base}/api/commands/addCartItem`, {
        data: { productId, variantId, quantity: 1 },
      }),
    ),
  );
  for (const response of concurrent)
    assert.equal(response.status(), 200, await response.text());
  assert.equal(
    (await guestRef.get()).get("requestedQuantity"),
    5,
    "Concurrent adds lost a quantity",
  );
  await page.reload();
  await expect(page.getByLabel("Quantity", { exact: true })).toHaveValue("5");
  await page.getByLabel("Quantity", { exact: true }).fill("4");
  await expect
    .poll(async () => (await guestRef.get()).get("requestedQuantity"))
    .toBe(4);
  const other = await browser.newContext(),
    otherPage = await other.newPage();
  await otherPage.goto(`${base}/cart`);
  await expect(otherPage.getByText("Your cart is empty.")).toBeVisible();
  await other.close();
  const crossSite = await context.request.post(
    `${base}/api/commands/addCartItem`,
    {
      headers: {
        origin: "https://untrusted.example",
        "sec-fetch-site": "cross-site",
      },
      data: { productId, variantId, quantity: 1 },
    },
  );
  assert.equal(crossSite.status(), 403);
  assert.equal((await guestRef.get()).get("requestedQuantity"), 4);
  mkdirSync("test-results/cart", { recursive: true });
  await page.screenshot({
    path: "test-results/cart/guest-cart.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Quantity", { exact: true })).toHaveValue("4");
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await page.screenshot({
    path: "test-results/cart/guest-cart-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log(
    "PASS Add to cart, selected quantity, refresh persistence, concurrent adds, quantity updates and guest isolation",
  );

  const email = `cart-${suffix}@example.test`,
    password = "DemoCart123!";
  const user = await auth.createUser({ email, password, emailVerified: true });
  await db
    .collection("users")
    .doc(user.uid)
    .set({
      name: "Demo Shopper",
      email,
      phone: null,
      avatarUrl: null,
      avatarPath: null,
      role: "CUSTOMER",
      isActive: true,
      emailVerified: true,
      ...stamp(),
    });
  await auth.setCustomUserClaims(user.uid, {
    role: "CUSTOMER",
    isActive: true,
    claimsVersion: 1,
  });
  const accountRef = db.collection("carts").doc(user.uid);
  await accountRef.set({
    userId: user.uid,
    currency: "PKR",
    expiresAt: new Date(Date.now() + 86400000),
    ...stamp(),
  });
  await accountRef
    .collection("items")
    .doc(variantId)
    .set({
      productId,
      variantId,
      requestedQuantity: 1,
      snapshot: {
        name: productName,
        slug: productId,
        brand: "Bazm",
        image: media,
        price,
        sku,
        color: "Ivory",
        size: "M",
      },
      ...stamp(),
    });
  const tokenResponse = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-api-key`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  assert.ok(tokenResponse.ok);
  const { idToken } = await tokenResponse.json();
  const session = await context.request.post(`${base}/api/auth/session`, {
    data: { idToken },
  });
  assert.equal(session.status(), 200, await session.text());
  await page.goto(`${base}/checkout`);
  await expect(
    page.getByRole("button", { name: "Pay Now", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      (await accountRef.collection("items").doc(variantId).get()).get(
        "requestedQuantity",
      ),
    )
    .toBe(5);
  await expect(page).toHaveURL(`${base}/checkout`);
  await page.goto(`${base}/cart`);
  await expect(
    page.getByRole("link", { name: "Continue to checkout", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Quantity", { exact: true })).toHaveValue("5");
  assert.equal(
    (await accountRef.collection("items").doc(variantId).get()).get(
      "requestedQuantity",
    ),
    5,
  );
  assert.equal((await guestRef.get()).exists, false);
  assert.ok(
    !(await context.cookies()).some((c) => c.name === "bazm_guest_cart"),
  );
  await context.request.post(`${base}/api/commands/mergeGuestCart`, {
    data: {},
  });
  assert.equal(
    (await accountRef.collection("items").doc(variantId).get()).get(
      "requestedQuantity",
    ),
    5,
    "Merge retry duplicated products",
  );
  await page.reload();
  await expect(page.getByLabel("Quantity", { exact: true })).toHaveValue("5");
  const stockError = await context.request.post(
    `${base}/api/commands/addCartItem`,
    { data: { productId, variantId, quantity: 50 } },
  );
  assert.equal(stockError.status(), 409);
  const tampered = await context.request.post(
    `${base}/api/commands/addCartItem`,
    { data: { productId, variantId, quantity: 1, price: 1 } },
  );
  assert.equal(tampered.status(), 400);
  await page
    .getByRole("link", { name: "Continue to checkout", exact: true })
    .click();
  await expect(page).toHaveURL(`${base}/checkout`);
  await expect(page.getByText(productName, { exact: true })).toBeVisible();
  await page.goto(`${base}/cart`);
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByText("Your cart is empty.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Your cart is empty.")).toBeVisible();
  console.log(
    "PASS account merge, repeated merge safety, saved account cart, stock validation, server pricing, checkout items and removal persistence",
  );
  await page.goto(`${base}/product/${productId}`);
  await page.getByLabel("Quantity", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Buy it now", exact: true }).click();
  await expect(page).toHaveURL(`${base}/checkout`);
  const address = {
    "Full name": "Demo Shopper",
    "Phone number": "+923001234567",
    "Street address": "12 Demo Road",
    "Area / neighbourhood": "Gulberg",
    City: "Lahore",
    "Postal code": "54000",
    "Save address as": "Home",
  };
  for (const [label, value] of Object.entries(address))
    await page
      .getByLabel(label, { exact: label !== "Phone number" })
      .fill(value);
  await page.locator('select[name="province"]').selectOption("PUNJAB");
  await page.getByRole("button", { name: "Save address", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pay Now", exact: true }),
  ).toBeEnabled();
  await page.getByRole("radio", { name: /Credit.*debit card/ }).check();
  await page
    .getByRole("button", { name: "Use test details", exact: true })
    .click();
  const paymentRequest = page.waitForRequest((request) =>
    request.url().endsWith("/api/payments/demo"),
  );
  await page.getByRole("button", { name: "Pay Now", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Processing payment…", exact: true }),
  ).toBeVisible();
  const requestBody = (await paymentRequest).postData();
  assert.ok(!requestBody.includes("4242") && !requestBody.includes("cardCvv"));
  await expect(page).toHaveURL(/\/checkout\/confirmation\//);
  await expect(page.getByText("Paid", { exact: true })).toBeVisible();
  const orderId = new URL(page.url()).pathname.split("/").at(-1);
  const order = (await db.collection("orders").doc(orderId).get()).data();
  assert.equal(order.status, "PAID");
  assert.equal(order.paymentMethod, "CARD");
  assert.equal(order.items[0].quantity, 2);
  await page.screenshot({
    path: "test-results/cart/buy-now-confirmation.png",
    fullPage: true,
  });
  console.log(
    "PASS guest Buy it now, payment UI on desktop/mobile, checkout merge after sign-in, account Buy it now, address saving and simulated Paid confirmation",
  );

  await page.goto(`${base}/product/${productId}/review`);
  await expect(
    page.getByRole("heading", { name: "Available after delivery" }),
  ).toBeVisible();
  await db
    .collection("orders")
    .doc(orderId)
    .update({ status: "DELIVERED", updatedAt: new Date() });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Submit review", exact: true }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: /Rating/ }).selectOption("4");
  await page
    .getByLabel("Review title (optional)", { exact: true })
    .fill("Lovely quality");
  await page
    .getByLabel("Your review", { exact: true })
    .fill("Beautiful finish and the size is just right for everyday use.");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: "test-results/cart/write-review-mobile.png",
    fullPage: true,
  });
  const reviewResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/commands/createReview"),
  );
  await page
    .getByRole("button", { name: "Submit review", exact: true })
    .click();
  const reviewResult = await reviewResponse;
  assert.equal(reviewResult.status(), 200, await reviewResult.text());
  await expect(
    page.getByText("Review submitted for moderation.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Update review", exact: true }),
  ).toBeVisible();
  const saved = (
    await db.collection("reviews").where("userId", "==", user.uid).get()
  ).docs;
  assert.equal(saved.length, 1);
  assert.equal(saved[0].get("rating"), 4);
  assert.equal(saved[0].get("productId"), productId);
  assert.equal(saved[0].get("status"), "PENDING");
  await page.goto(`${base}/product/${productId}`);
  await expect(page.getByText("Lovely quality", { exact: true })).toHaveCount(
    0,
  );
  console.log(
    "PASS product review entry, sign-in return path, delivered purchase eligibility, mobile form, persisted review and moderation visibility",
  );
  await context.close();
} finally {
  await browser?.close();
  await db.terminate();
  await deleteApp(app);
}
