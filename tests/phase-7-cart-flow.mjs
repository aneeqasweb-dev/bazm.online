import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const projectId = "demo-bazm-online";
const apiKey = "demo-api-key";
const authOrigin = "http://127.0.0.1:9099";
const functionsOrigin = `http://127.0.0.1:5001/${projectId}/asia-south1`;
const appOrigin = "http://127.0.0.1:3103";
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

async function callFunction(name, idToken, data) {
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

function media() {
  return [
    {
      path: `products/phase-7/${suffix}.webp`,
      url: `http://127.0.0.1:9199/v0/b/demo-bazm-online.appspot.com/o/products%2Fphase-7%2F${suffix}.webp`,
      alt: "Phase seven linen shirt",
      width: 1200,
      height: 1600,
      contentType: "image/webp",
      contentHash: `phase7-${suffix}-0123456789abcdef`,
      sortOrder: 0,
    },
  ];
}

try {
  const signup = await authRequest("accounts:signUp", {
    email: `phase-7-${suffix}@example.test`,
    password: "Secure123",
    returnSecureToken: true,
  });
  assert.ok(signup.response.ok && signup.data.idToken && signup.data.localId);
  assert.ok(
    (
      await callFunction("completeRegistration", signup.data.idToken, {
        name: "Phase Seven Customer",
      })
    ).response.ok,
  );
  await auth.setCustomUserClaims(signup.data.localId, {
    role: "CUSTOMER",
    isActive: true,
    claimsVersion: 1,
  });
  await auth.updateUser(signup.data.localId, { emailVerified: true });
  const token = await refreshToken(signup.data.refreshToken);

  const categoryId = `phase7-category-${suffix}`;
  const productId = `phase7-product-${suffix}`;
  const variantId = "natural-m";
  const sku = `P7-LINEN-${suffix}`;
  const slug = `phase-seven-linen-${suffix}`;
  await firestore
    .collection("categories")
    .doc(categoryId)
    .create({
      name: "Linen",
      slug: `linen-${suffix}`,
      parentId: null,
      depth: 0,
      sortOrder: 0,
      image: null,
      seo: { title: null, description: null },
      status: "ACTIVE",
      archivedAt: null,
      schemaVersion: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  await firestore
    .collection("products")
    .doc(productId)
    .create({
      name: "Cart Linen Shirt",
      slug,
      description:
        "A durable linen piece used to verify cart snapshots and secure totals.",
      categoryId,
      categoryPath: [categoryId],
      brand: "Bazm",
      basePrice: { amountMinor: 5000, currency: "PKR" },
      media: media(),
      tags: ["linen", "shirt"],
      searchTokens: ["cart", "linen", "shirt", "bazm"],
      ratingSummary: { average: 0, count: 0 },
      flags: { featured: false, newArrival: false },
      seo: { title: null, description: null },
      status: "PUBLISHED",
      publishedAt: FieldValue.serverTimestamp(),
      archivedAt: null,
      schemaVersion: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  await firestore
    .collection("products")
    .doc(productId)
    .collection("variants")
    .doc(variantId)
    .create({
      productId,
      sku,
      color: "Natural",
      size: "M",
      priceOverride: null,
      media: [],
      isActive: true,
      schemaVersion: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

  assert.ok(
    (
      await callFunction("addCartItem", token, {
        productId,
        variantId,
        quantity: 1,
      })
    ).response.ok,
    "Cart add failed",
  );
  await firestore
    .collection("products")
    .doc(productId)
    .update({
      basePrice: { amountMinor: 9000, currency: "PKR" },
      updatedAt: FieldValue.serverTimestamp(),
    });
  assert.ok(
    (
      await callFunction("addCartItem", token, {
        productId,
        variantId,
        quantity: 1,
      })
    ).response.ok,
    "Cart duplicate merge failed",
  );
  const lineRef = firestore
    .collection("carts")
    .doc(signup.data.localId)
    .collection("items")
    .doc(variantId);
  const merged = await lineRef.get();
  assert.equal(
    merged.get("requestedQuantity"),
    2,
    "Duplicate variant did not merge",
  );
  assert.equal(
    merged.get("snapshot").price.amountMinor,
    5000,
    "Cart snapshot price was mutated",
  );
  const tampered = await callFunction("addCartItem", token, {
    productId,
    variantId,
    quantity: 1,
    price: { amountMinor: 1, currency: "PKR" },
  });
  assert.equal(tampered.response.ok, false, "Client supplied a cart price");

  await firestore.collection("inventory").doc(sku).create({
    sku,
    productId,
    variantId,
    available: 1,
    reserved: 0,
    sold: 0,
    returned: 0,
    damaged: 0,
    reorderPoint: 0,
    reservedUntil: null,
    schemaVersion: 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const excessive = await callFunction("updateCartItem", token, {
    variantId,
    quantity: 2,
  });
  assert.equal(
    excessive.response.ok,
    false,
    "Cart accepted quantity above known stock",
  );
  assert.ok(
    (await callFunction("updateCartItem", token, { variantId, quantity: 1 }))
      .response.ok,
    "Cart quantity update failed",
  );
  assert.ok(
    (await callFunction("moveCartItemToWishlist", token, { variantId }))
      .response.ok,
    "Move to wishlist failed",
  );
  assert.equal(
    (await lineRef.get()).exists,
    false,
    "Moved cart item still exists",
  );
  assert.equal(
    (
      await firestore
        .collection("wishlists")
        .doc(signup.data.localId)
        .collection("items")
        .doc(productId)
        .get()
    ).exists,
    true,
    "Wishlist item was not created",
  );
  assert.ok(
    (
      await callFunction("addCartItem", token, {
        productId,
        variantId,
        quantity: 1,
      })
    ).response.ok,
    "Cart re-add failed",
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
      "3103",
    ],
    {
      cwd: fileURLToPath(new URL("../frontend", import.meta.url)),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  nextServer.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  nextServer.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  try {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try {
        if ((await fetch(`${appOrigin}/shop`)).ok) break;
      } catch {
        /* starting */
      }
      if (attempt === 79)
        throw new Error(`Next.js server did not start. ${output}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const session = await fetch(`${appOrigin}/api/auth/session`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: appOrigin },
      body: JSON.stringify({ idToken: token }),
    });
    const cookie = session.headers.get("set-cookie")?.split(";")[0];
    assert.ok(session.ok && cookie, "Customer web session failed");
    const cart = await fetch(`${appOrigin}/cart`, { headers: { cookie } });
    const html = await cart.text();
    assert.ok(
      cart.ok &&
        html.includes("Cart Linen Shirt") &&
        html.includes("Estimated total"),
      "Persistent cart did not render",
    );
  } finally {
    const stopped = new Promise((resolve) => nextServer.once("exit", resolve));
    nextServer.kill("SIGTERM");
    await Promise.race([
      stopped,
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
    if (nextServer.exitCode === null && nextServer.signalCode === null) {
      nextServer.kill("SIGKILL");
      await stopped;
    }
  }
  console.log(
    "Phase 7 cart flow passed secure snapshots, validation, persistence, and cart rendering.",
  );
} finally {
  await deleteApp(app).catch(() => undefined);
}
