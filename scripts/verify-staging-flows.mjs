import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { chromium } from "@playwright/test";
import { returnPolicySchema } from "@bazm/domain";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { v2 as cloudinary } from "cloudinary";

// Run against the local server or Bazm's hosted portfolio using staging data. All writes
// belong to temporary identities and a temporary catalog item, removed below.
const env = parseEnv(readFileSync("frontend/.env.local", "utf8"));
for (const [key, value] of Object.entries(env)) process.env[key] ??= value;
assert.equal(
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  "bazmonline-staging-aneeqa",
);
assert.equal(process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS, "false");
assert.ok(
  !process.env.FIREBASE_AUTH_EMULATOR_HOST &&
    !process.env.FIRESTORE_EMULATOR_HOST,
);
assert.ok(
  !process.env.EMAIL_PROVIDER_API_KEY,
  "Do not run with a live email provider.",
);
const base = process.env.STAGING_TEST_BASE_URL ?? "http://127.0.0.1:3122";
const target = new URL(base);
const isPreview =
  /^bazm-online-frontend-[a-z0-9]+-aneeqadev-6239s-projects\.vercel\.app$/.test(
    target.hostname,
  ) && target.protocol === "https:";
assert.ok(
  ["127.0.0.1", "localhost"].includes(target.hostname) ||
    target.origin === "https://bazm-online-frontend.vercel.app" ||
    isPreview,
  "Only local development and the known Bazm portfolio host are allowed.",
);
const deploymentHeaders = {};
if (isPreview) {
  const { token } = JSON.parse(
    readFileSync(
      `${process.env.HOME}/.local/share/com.vercel.cli/auth.json`,
      "utf8",
    ),
  );
  const response = await fetch(
    "https://api.vercel.com/v9/projects/prj_EJaOUvs2AYTbScUisKkW1cNTwEbM",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  assert.ok(response.ok, "Vercel sign-in is required for preview testing.");
  const project = await response.json();
  const bypass = Object.keys(project.protectionBypass ?? {})[0];
  assert.ok(
    bypass,
    "Use vercel curl once to configure preview automation access.",
  );
  deploymentHeaders["x-vercel-protection-bypass"] = bypass;
}
const app = initializeApp({
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  credential: process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON
    ? cert(JSON.parse(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON))
    : applicationDefault(),
});
const auth = getAuth(app);
const db = getFirestore(app);
cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
const run = `qa-${Date.now()}-${randomBytes(3).toString("hex")}`;
const users = [];
const documents = new Set();
const mediaPaths = new Set();
const browser = await chromium.launch({ headless: true });
let productId;
let sku;

function record(collection, id) {
  assert.ok(id, `Missing ${collection} ID`);
  documents.add(`${collection}/${id}`);
  return id;
}
async function firebase(endpoint, body) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/${endpoint}?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const data = await response.json();
  assert.ok(
    response.ok,
    `${endpoint}: ${data.error?.message ?? response.status}`,
  );
  return data;
}
async function api(
  path,
  body,
  { token, cookie, method = "POST", status = 200 } = {},
) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...deploymentHeaders,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  assert.equal(
    response.status,
    status,
    `${path}: ${data.error ?? response.status}`,
  );
  return { data, response };
}
async function command(user, name, input, status = 200) {
  const result = await api(`/api/commands/${name}`, input, {
    cookie: user.cookie,
    status,
  });
  return result.data.data;
}
async function session(user) {
  const login = await firebase("accounts:signInWithPassword", {
    email: user.email,
    password: user.password,
    returnSecureToken: true,
  });
  await api("/api/auth/authorization", {}, { token: login.idToken });
  const fresh = await firebase("accounts:signInWithPassword", {
    email: user.email,
    password: user.password,
    returnSecureToken: true,
  });
  const result = await api("/api/auth/session", { idToken: fresh.idToken });
  user.cookie = result.response.headers.get("set-cookie").split(";")[0];
}
async function createUser(label, role = "CUSTOMER") {
  const user = {
    email: `${run}-${label}@example.test`,
    password: `Qa1!${randomBytes(20).toString("hex")}`,
  };
  const created = await firebase("accounts:signUp", {
    email: user.email,
    password: user.password,
    returnSecureToken: true,
  });
  user.uid = created.localId;
  users.push(user);
  await api(
    "/api/auth/registration",
    { name: `Staging QA ${label}` },
    { token: created.idToken },
  );
  const profile = db.collection("users").doc(user.uid);
  assert.equal((await profile.get()).get("role"), "CUSTOMER");
  await session(user);
  await command(user, "addCartItem", {}, 403);
  // Redeem a generated verification link without delivering email to a mailbox.
  const link = new URL(await auth.generateEmailVerificationLink(user.email));
  await firebase("accounts:update", {
    oobCode: link.searchParams.get("oobCode"),
  });
  if (role !== "CUSTOMER") await profile.update({ role });
  await session(user);
  return user;
}
async function upload(user, purpose, status = 200) {
  const form = new FormData();
  form.set("purpose", purpose);
  form.set(
    "file",
    new Blob(
      [
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          "base64",
        ),
      ],
      { type: "image/png" },
    ),
    "qa.png",
  );
  const response = await fetch(`${base}/api/media/upload`, {
    method: "POST",
    headers: { ...deploymentHeaders, Cookie: user.cookie },
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  assert.equal(
    response.status,
    status,
    `Upload ${purpose}: ${data.error ?? "No JSON response"}`,
  );
  if (data.asset) mediaPaths.add(data.asset.path);
  return data.asset;
}

try {
  const customer = await createUser("customer");
  const admin = await createUser("admin", "ADMIN");
  console.log(
    "PASS registration, email verification, session creation, unverified access denial",
  );
  if (process.env.STAGING_TEST_BROWSER_ONLY !== "true") {
    await command(customer, "createCategory", {}, 403);
    await upload(customer, "product", 403);
    console.log(
      "PASS customer cannot access admin commands or catalog uploads",
    );

    const avatar = await upload(customer, "avatar");
    await api(
      "/api/account/profile",
      { name: "Staging QA Customer", phone: null, avatarPath: avatar.path },
      { cookie: customer.cookie, method: "PATCH" },
    );
    assert.equal(
      (await db.doc(`users/${customer.uid}`).get()).get("avatarPath"),
      avatar.path,
    );
    await api(
      "/api/account/profile",
      { name: "Staging QA Customer", phone: null, avatarPath: null },
      { cookie: customer.cookie, method: "PATCH" },
    );
    console.log(
      "PASS Cloudinary avatar upload, profile save, and avatar removal",
    );

    const categorySlug = `${run}-category`;
    const category = await command(admin, "createCategory", {
      name: `QA ${run}`,
      slug: categorySlug,
      parentId: null,
    });
    record("categories", category.id);
    record("slugRegistry", `category_${categorySlug}`);
    await command(admin, "setCategoryStatus", {
      id: category.id,
      status: "ACTIVE",
    });
    const asset = await upload(admin, "product");
    const { provider, size, ...image } = asset;
    const productSlug = `${run}-product`;
    const product = await command(admin, "createProduct", {
      name: `QA Product ${run}`,
      slug: productSlug,
      description:
        "Temporary staging verification product. Removed automatically after the test.",
      categoryId: category.id,
      basePrice: { amountMinor: 250000, currency: "PKR" },
      media: [{ ...image, alt: "Staging test image", sortOrder: 0 }],
    });
    productId = record("products", product.id);
    record("slugRegistry", `product_${productSlug}`);
    sku = run.toUpperCase();
    const variant = await command(admin, "createProductVariant", {
      productId,
      variant: { sku, color: "Green", size: "M" },
    });
    record("skuRegistry", sku);
    record("inventory", sku);
    await command(admin, "receiveInventory", {
      productId,
      variantId: variant.id,
      sku,
      quantity: 10,
      reason: "Temporary staging QA stock",
    });
    await command(admin, "setProductStatus", {
      id: productId,
      status: "PUBLISHED",
    });
    console.log(
      "PASS admin category, product, variant, image upload, inventory receipt, publication",
    );

    await command(customer, "addWishlistItem", { productId });
    await command(customer, "removeWishlistItem", { productId });
    await command(customer, "addCartItem", {
      productId,
      variantId: variant.id,
      quantity: 2,
    });
    await command(customer, "updateCartItem", {
      variantId: variant.id,
      quantity: 1,
    });
    const address = await command(customer, "createAddress", {
      label: "QA Home",
      recipientName: "Staging QA Customer",
      phone: "+923001234567",
      line1: "1 Test Road",
      line2: null,
      area: "Gulberg",
      city: "Lahore",
      province: "PUNJAB",
      postalCode: "54000",
      deliveryInstructions: null,
    });
    const intent = {
      idempotencyKey: run,
      shippingAddressId: address.addressId ?? address.id,
      billingAddressId: null,
      couponCode: null,
      paymentMethod: "CASH_ON_DELIVERY",
      deliveryMethod: "STANDARD",
      customerNote: "Automated staging verification",
    };
    const checkout = await command(customer, "createCheckout", intent);
    record("orders", checkout.orderId);
    const repeated = await command(customer, "createCheckout", intent);
    assert.equal(repeated.orderId, checkout.orderId);
    const stock = await db.doc(`inventory/${sku}`).get();
    assert.equal(stock.get("available"), 9);
    assert.equal(stock.get("reserved"), 1);
    await command(admin, "cancelMyOrder", { orderId: checkout.orderId }, 403);
    console.log(
      "PASS wishlist, cart, address, COD checkout, idempotency, reservation, order ownership",
    );

    for (const status of ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"]) {
      await command(admin, "transitionOrder", {
        orderId: checkout.orderId,
        status,
        trackingNumber: status === "SHIPPED" ? `QA-${run}` : null,
      });
    }
    const review = await command(customer, "createReview", {
      productId,
      variantId: variant.id,
      orderId: checkout.orderId,
      rating: 5,
      title: "Staging verification",
      content: "This is a temporary automated staging review.",
      images: [],
    });
    record("reviews", review.id);
    await command(admin, "moderateReview", {
      reviewId: review.id,
      status: "PUBLISHED",
      moderationReason: null,
    });
    const ticket = await command(customer, "createSupportTicket", {
      subject: "Staging QA support",
      message: "Temporary support workflow verification.",
      relatedOrderId: checkout.orderId,
    });
    record("supportTickets", ticket.id);
    await command(admin, "manageSupportTicket", {
      ticketId: ticket.id,
      status: "RESOLVED",
      message: "Verification completed.",
    });
    console.log(
      "PASS admin order fulfilment, customer review, review moderation, support resolution",
    );

    const deliveredOrder = await db.doc(`orders/${checkout.orderId}`).get();
    const policyDocument = await db.doc("settings/returns.policy").get();
    const policy = returnPolicySchema.parse(policyDocument.get("value") ?? {});
    const returned = await command(customer, "createReturn", {
      orderId: checkout.orderId,
      items: [
        {
          orderItemId: deliveredOrder.get("items")[0].variantId,
          quantity: 1,
          reason: policy.reasons[0],
        },
      ],
    });
    record("returns", returned.id ?? returned.returnId);
    for (const status of ["APPROVED", "RECEIVED"]) {
      await command(admin, "updateReturnStatus", {
        returnId: returned.id ?? returned.returnId,
        status,
        condition: status === "RECEIVED" ? "RESELLABLE" : null,
      });
    }
    assert.equal((await db.doc(`inventory/${sku}`).get()).get("reserved"), 0);
    console.log(
      "PASS customer return, admin approval, receipt, and inventory accounting",
    );

    await command(customer, "addCartItem", {
      productId,
      variantId: variant.id,
      quantity: 1,
    });
    const card = await command(customer, "createCheckout", {
      ...intent,
      idempotencyKey: `${run}-card`,
      paymentMethod: "CARD",
    });
    record("orders", card.orderId);
    const attempt = await command(customer, "createPaymentAttempt", {
      orderId: card.orderId,
    });
    assert.match(
      attempt.redirectUrl,
      /^\/checkout\/payment\/sandbox\?attempt=/,
    );
    await command(customer, "cancelMyOrder", { orderId: card.orderId });
    assert.equal((await db.doc(`inventory/${sku}`).get()).get("reserved"), 0);
    console.log(
      "PASS sandbox card attempt and unpaid cancellation release reserved stock",
    );
  }

  for (const [user, path] of [
    [customer, "/account"],
    [admin, "/admin"],
  ]) {
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);
    if (isPreview) {
      await page.route(`${base}/**`, (route) =>
        route.continue({
          headers: { ...route.request().headers(), ...deploymentHeaders },
        }),
      );
    }
    await page.goto(`${base}/login?next=${path}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL((url) => url.pathname === path, {
      timeout: 60000,
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("heading", {
        name: path === "/admin" ? "Administration" : "Your account",
        exact: true,
      })
      .waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
    assert.equal(new URL(page.url()).pathname, path);
    await page
      .getByRole("heading", {
        name: path === "/admin" ? "Administration" : "Your account",
        exact: true,
      })
      .waitFor();
    if (path === "/admin") {
      for (const module of [
        "products",
        "inventory",
        "orders",
        "customers",
        "reviews",
        "returns",
        "support",
        "payments",
      ]) {
        const response = await page.goto(`${base}/admin/${module}`, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
        assert.equal(response.status(), 200, `Admin ${module}`);
        assert.equal(new URL(page.url()).pathname, `/admin/${module}`);
        await page.locator("h1").waitFor();
        assert.equal(
          await page
            .getByText("This page couldn’t load", { exact: true })
            .count(),
          0,
        );
      }
    }
    await page.close();
  }
  console.log(
    "PASS actual customer/admin browser sign-in and eight admin pages",
  );
} catch (error) {
  console.error(`FAIL staging verification: ${error.message}`);
  throw error;
} finally {
  await browser.close();
  // Only exact identities created in this run are used for cleanup queries.
  for (const user of users) {
    for (const collection of [
      "orders",
      "payments",
      "paymentAttempts",
      "inventoryReservations",
      "checkoutRequests",
      "customerActivities",
      "emailDeliveries",
      "emailPreviews",
      "reviewLineRegistry",
      "returns",
    ]) {
      const found = await db
        .collection(collection)
        .where("userId", "==", user.uid)
        .get();
      for (const doc of found.docs) documents.add(doc.ref.path);
    }
    for (const collection of ["auditLogs", "inventoryTransactions"]) {
      const found = await db
        .collection(collection)
        .where("actorId", "==", user.uid)
        .get();
      for (const doc of found.docs) documents.add(doc.ref.path);
    }
    for (const collection of ["users", "carts", "wishlists"])
      documents.add(`${collection}/${user.uid}`);
  }
  for (const path of documents) await db.recursiveDelete(db.doc(path));
  for (const user of users) await auth.deleteUser(user.uid);
  for (const path of mediaPaths) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await cloudinary.uploader.destroy(path, {
          invalidate: true,
          resource_type: "image",
          timeout: 30000,
        });
        break;
      } catch (error) {
        if (attempt === 2) throw error;
      }
    }
  }
  console.log(`Cleaned temporary staging fixtures for ${run}`);
}
