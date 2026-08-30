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
const appOrigin = "http://127.0.0.1:3102";
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

function media(index) {
  return [
    {
      path: `products/phase-6/${index}.webp`,
      url: `http://127.0.0.1:9199/v0/b/demo-bazm-online.appspot.com/o/products%2Fphase-6%2F${index}.webp`,
      alt: `Linen product ${index}`,
      width: 1200,
      height: 1600,
      contentType: "image/webp",
      contentHash: `phase6-${index}-0123456789abcdef`,
      sortOrder: 0,
    },
  ];
}

try {
  const signup = await authRequest("accounts:signUp", {
    email: `phase-6-${suffix}@example.test`,
    password: "Secure123",
    returnSecureToken: true,
  });
  assert.ok(signup.response.ok && signup.data.idToken && signup.data.localId);
  assert.ok(
    (
      await callFunction("completeRegistration", signup.data.idToken, {
        name: "Phase Six Customer",
      })
    ).response.ok,
  );
  await auth.setCustomUserClaims(signup.data.localId, {
    role: "CUSTOMER",
    isActive: true,
    claimsVersion: 1,
  });
  await auth.updateUser(signup.data.localId, { emailVerified: true });
  const customerToken = await refreshToken(signup.data.refreshToken);

  const categoryId = `phase6-category-${suffix}`;
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
  const productIds = [];
  for (let index = 0; index < 25; index += 1) {
    const id = `phase6-product-${suffix}-${index}`;
    const slug = `linen-${suffix}-${index}`;
    productIds.push(id);
    await firestore
      .collection("products")
      .doc(id)
      .create({
        name: `Linen Edit ${index}`,
        slug,
        description:
          "A lasting linen piece used to verify bounded storefront pagination and selection behavior.",
        categoryId,
        categoryPath: [categoryId],
        brand: "Bazm",
        basePrice: { amountMinor: 1000 + index, currency: "PKR" },
        media: media(index),
        tags: ["linen", "shirt"],
        searchTokens: ["linen", "edit", "bazm", "shirt"],
        ratingSummary: { average: 4.5, count: 1 },
        flags: { featured: index < 2, newArrival: index < 2 },
        seo: { title: null, description: null },
        status: "PUBLISHED",
        publishedAt: FieldValue.serverTimestamp(),
        archivedAt: null,
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    await firestore.collection("slugRegistry").doc(`product_${slug}`).create({
      type: "PRODUCT",
      ownerId: id,
      slug,
      createdAt: FieldValue.serverTimestamp(),
    });
    await firestore
      .collection("products")
      .doc(id)
      .collection("variants")
      .doc("linen-m")
      .create({
        productId: id,
        sku: `P6-${suffix}-${index}`,
        color: "Natural",
        size: "M",
        priceOverride: null,
        media: [],
        isActive: true,
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
  }

  assert.ok(
    (
      await callFunction("addWishlistItem", customerToken, {
        productId: productIds[0],
      })
    ).response.ok,
    "Wishlist add failed",
  );
  assert.ok(
    (
      await callFunction("addWishlistItem", customerToken, {
        productId: productIds[0],
      })
    ).response.ok,
    "Wishlist add was not idempotent",
  );
  const wishlistItems = await firestore
    .collection("wishlists")
    .doc(signup.data.localId)
    .collection("items")
    .get();
  assert.equal(wishlistItems.size, 1, "Wishlist duplicated an item");
  assert.ok(
    (
      await callFunction("removeWishlistItem", customerToken, {
        productId: productIds[0],
      })
    ).response.ok,
    "Wishlist removal failed",
  );
  assert.ok(
    (
      await callFunction("removeWishlistItem", customerToken, {
        productId: productIds[0],
      })
    ).response.ok,
    "Wishlist removal was not idempotent",
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
      "3102",
    ],
    {
      cwd: fileURLToPath(new URL("../frontend", import.meta.url)),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let serverOutput = "";
  nextServer.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  nextServer.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  try {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try {
        if ((await fetch(`${appOrigin}/shop`)).ok) break;
      } catch {
        /* server is still starting */
      }
      if (attempt === 79)
        throw new Error(`Next.js server did not start. ${serverOutput}`);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const shop = await fetch(
      `${appOrigin}/shop?q=linen&category=${categoryId}&color=Natural&size=M&rating=4`,
    );
    const shopHtml = await shop.text();
    assert.ok(
      shop.ok &&
        shopHtml.includes("Next products") &&
        shopHtml.includes("Linen Edit"),
      "Bounded filtered catalog did not render its first page",
    );
    const product = await fetch(`${appOrigin}/product/linen-${suffix}-0`);
    const productHtml = await product.text();
    assert.ok(
      product.ok &&
        productHtml.includes("Linen Edit 0") &&
        productHtml.includes("Color"),
      "Product detail did not render",
    );
    const sessionResponse = await fetch(`${appOrigin}/api/auth/session`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: appOrigin },
      body: JSON.stringify({ idToken: customerToken }),
    });
    const sessionCookie = sessionResponse.headers
      .get("set-cookie")
      ?.split(";")[0];
    assert.ok(
      sessionResponse.ok && sessionCookie,
      "Customer web session failed",
    );
    const wishlist = await fetch(`${appOrigin}/wishlist`, {
      headers: { cookie: sessionCookie },
    });
    assert.ok(
      wishlist.ok && (await wishlist.text()).includes("Your wishlist is empty"),
      "Private wishlist did not render for its owner",
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
    "Phase 6 storefront flow passed bounded filters/pagination, product detail, and private wishlist idempotency.",
  );
} finally {
  await deleteApp(app).catch(() => undefined);
}
