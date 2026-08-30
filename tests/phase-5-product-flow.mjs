import assert from "node:assert/strict";

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

function media(label) {
  return [
    {
      path: `products/fixtures/${label}.webp`,
      url: `https://example.test/products/${label}.webp`,
      alt: `${label} product image`,
      width: 1200,
      height: 1600,
      contentType: "image/webp",
      contentHash: `${label}-0123456789abcdef`,
      sortOrder: 0,
    },
  ];
}

function product(slug, categoryId) {
  return {
    name: "Linen Studio Shirt",
    slug,
    description:
      "A durable linen shirt fixture for trusted product lifecycle verification.",
    categoryId,
    basePrice: { amountMinor: 4_999, currency: "PKR" },
    media: media(slug),
    tags: ["linen", "shirt"],
    flags: { featured: false, newArrival: true },
    seo: { title: null, description: null },
  };
}

try {
  const signUp = await authRequest("accounts:signUp", {
    email: `phase-5-${suffix}@example.test`,
    password: "Secure123",
    returnSecureToken: true,
  });
  assert.ok(signUp.response.ok && signUp.data.idToken && signUp.data.localId);
  assert.ok(
    (
      await callFunction("completeRegistration", signUp.data.idToken, {
        name: "Phase Five Admin",
      })
    ).response.ok,
  );

  const categoryId = `phase5-category-${suffix}`;
  await firestore
    .collection("categories")
    .doc(categoryId)
    .create({
      name: "Women",
      slug: `women-${suffix}`,
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

  const denied = await callFunction(
    "createProduct",
    signUp.data.idToken,
    product(`shirt-${suffix}`, categoryId),
  );
  assert.equal(denied.response.ok, false, "Customer created a product");

  await auth.setCustomUserClaims(signUp.data.localId, {
    role: "ADMIN",
    isActive: true,
    claimsVersion: 1,
  });
  const adminToken = await refreshToken(signUp.data.refreshToken);
  const productResponse = await callFunction(
    "createProduct",
    adminToken,
    product(`shirt-${suffix}`, categoryId),
  );
  assert.ok(
    productResponse.response.ok && productResponse.data.result?.id,
    "Product creation failed",
  );
  const productId = productResponse.data.result.id;

  const duplicateSlug = await callFunction(
    "createProduct",
    adminToken,
    product(`shirt-${suffix}`, categoryId),
  );
  assert.equal(
    duplicateSlug.response.ok,
    false,
    "Duplicate product slug was accepted",
  );
  const invalidPrice = await callFunction("createProduct", adminToken, {
    ...product(`invalid-${suffix}`, categoryId),
    basePrice: { amountMinor: 0, currency: "PKR" },
  });
  assert.equal(
    invalidPrice.response.ok,
    false,
    "Zero product price was accepted",
  );
  const prematurePublish = await callFunction("setProductStatus", adminToken, {
    id: productId,
    status: "PUBLISHED",
  });
  assert.equal(
    prematurePublish.response.ok,
    false,
    "Product published without an active variant",
  );

  const firstVariant = await callFunction("createProductVariant", adminToken, {
    productId,
    variant: {
      sku: `W-SHIRT-${suffix}`,
      color: "Natural",
      size: "M",
      priceOverride: null,
      media: media(`variant-${suffix}`),
    },
  });
  assert.ok(
    firstVariant.response.ok && firstVariant.data.result?.id,
    "Variant creation failed",
  );
  assert.ok(
    (
      await callFunction("setProductStatus", adminToken, {
        id: productId,
        status: "PUBLISHED",
      })
    ).response.ok,
    "Product publication failed",
  );

  const secondProduct = await callFunction(
    "createProduct",
    adminToken,
    product(`shirt-two-${suffix}`, categoryId),
  );
  assert.ok(secondProduct.response.ok && secondProduct.data.result?.id);
  const concurrentSku = `W-CONCURRENT-${suffix}`;
  const attempts = await Promise.all([
    callFunction("createProductVariant", adminToken, {
      productId,
      variant: {
        sku: concurrentSku,
        color: "Black",
        size: "L",
        priceOverride: null,
        media: [],
      },
    }),
    callFunction("createProductVariant", adminToken, {
      productId: secondProduct.data.result.id,
      variant: {
        sku: concurrentSku,
        color: "White",
        size: "S",
        priceOverride: null,
        media: [],
      },
    }),
  ]);
  assert.equal(
    attempts.filter((attempt) => attempt.response.ok).length,
    1,
    "SKU uniqueness was not transactional",
  );

  assert.ok(
    (
      await callFunction("setProductStatus", adminToken, {
        id: productId,
        status: "ARCHIVED",
      })
    ).response.ok,
    "Product archive failed",
  );
  const stored = await firestore.collection("products").doc(productId).get();
  assert.equal(stored.get("status"), "ARCHIVED");
  assert.equal(
    stored.get("media")[0].path,
    `products/fixtures/shirt-${suffix}.webp`,
  );
  assert.equal(
    (await firestore.collection("skuRegistry").doc(`W-SHIRT-${suffix}`).get())
      .exists,
    true,
  );
  console.log(
    "Phase 5 product flow passed product lifecycle, metadata, authorization, and transactional SKU checks.",
  );
} finally {
  await deleteApp(app).catch(() => undefined);
}
