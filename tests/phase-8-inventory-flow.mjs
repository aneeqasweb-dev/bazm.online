import assert from "node:assert/strict";

import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";

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

async function callFunction(name, idToken, data = {}) {
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

async function account(role) {
  const signup = await authRequest("accounts:signUp", {
    email: `phase-8-${role.toLowerCase()}-${suffix}@example.test`,
    password: "Secure123",
    returnSecureToken: true,
  });
  assert.ok(signup.response.ok && signup.data.idToken && signup.data.localId);
  assert.ok(
    (
      await callFunction("completeRegistration", signup.data.idToken, {
        name: `Phase Eight ${role}`,
      })
    ).response.ok,
  );
  await auth.setCustomUserClaims(signup.data.localId, {
    role,
    isActive: true,
    claimsVersion: 1,
  });
  await auth.updateUser(signup.data.localId, { emailVerified: true });
  return {
    uid: signup.data.localId,
    token: await refreshToken(signup.data.refreshToken),
  };
}

try {
  const [admin, customer] = await Promise.all([
    account("ADMIN"),
    account("CUSTOMER"),
  ]);
  const categoryId = `phase8-category-${suffix}`;
  const productId = `phase8-product-${suffix}`;
  const variantId = "linen-m";
  const sku = `P8-LINEN-${suffix}`;
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
      name: "Inventory Linen Shirt",
      slug: `inventory-linen-${suffix}`,
      description:
        "A durable linen item used to verify transactional inventory movements.",
      categoryId,
      categoryPath: [categoryId],
      brand: "Bazm",
      basePrice: { amountMinor: 5000, currency: "PKR" },
      media: [
        {
          path: `products/phase-8/${suffix}.webp`,
          url: `http://127.0.0.1:9199/phase-8/${suffix}.webp`,
          alt: "Phase eight linen shirt",
          width: 1200,
          height: 1600,
          contentType: "image/webp",
          contentHash: `phase8-${suffix}-0123456789abcdef`,
          sortOrder: 0,
        },
      ],
      tags: ["linen"],
      searchTokens: ["inventory", "linen"],
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

  assert.equal(
    (
      await callFunction("receiveInventory", customer.token, {
        productId,
        variantId,
        sku,
        quantity: 2,
        reason: "Unauthorized receipt",
      })
    ).response.ok,
    false,
    "Customer could receive stock",
  );
  assert.ok(
    (
      await callFunction("receiveInventory", admin.token, {
        productId,
        variantId,
        sku,
        quantity: 2,
        reason: "Opening stock receipt",
      })
    ).response.ok,
    "Admin stock receipt failed",
  );
  assert.ok(
    (
      await callFunction("adjustInventory", admin.token, {
        sku,
        delta: -1,
        reason: "Cycle count correction",
      })
    ).response.ok,
  );
  assert.ok(
    (
      await callFunction("restoreInventoryReturn", admin.token, {
        sku,
        quantity: 1,
        reason: "Returned in resellable condition",
      })
    ).response.ok,
  );
  assert.ok(
    (
      await callFunction("recordInventoryDamage", admin.token, {
        sku,
        quantity: 1,
        reason: "Damaged during handling",
      })
    ).response.ok,
  );
  let inventory = await firestore.collection("inventory").doc(sku).get();
  assert.equal(inventory.get("available"), 1);
  assert.equal(inventory.get("returned"), 1);
  assert.equal(inventory.get("damaged"), 1);
  assert.equal(
    (
      await firestore
        .collection("inventoryTransactions")
        .where("sku", "==", sku)
        .get()
    ).size,
    4,
    "Every admin movement did not create a ledger record",
  );
  assert.equal(
    (
      await firestore
        .collection("auditLogs")
        .where("action", "==", "INVENTORY")
        .get()
    ).size,
    4,
    "Every admin movement did not create an audit record",
  );

  const firstKey = `reserveA${suffix}`;
  const secondKey = `reserveB${suffix}`;
  const [first, second] = await Promise.all([
    callFunction("reserveInventory", customer.token, {
      idempotencyKey: firstKey,
      lines: [{ sku, quantity: 1 }],
    }),
    callFunction("reserveInventory", customer.token, {
      idempotencyKey: secondKey,
      lines: [{ sku, quantity: 1 }],
    }),
  ]);
  const successful = [first, second].filter((result) => result.response.ok);
  assert.equal(
    successful.length,
    1,
    "Concurrent last-item reservation was not exclusive",
  );
  const reservationId = successful[0].data.result.reservationId;
  assert.equal(
    (
      await callFunction("reserveInventory", customer.token, {
        idempotencyKey: successful[0] === first ? firstKey : secondKey,
        lines: [{ sku, quantity: 1 }],
      })
    ).data.result.idempotent,
    true,
    "Reservation idempotency key duplicated stock movement",
  );
  inventory = await firestore.collection("inventory").doc(sku).get();
  assert.equal(inventory.get("available"), 0);
  assert.equal(inventory.get("reserved"), 1);
  assert.ok(
    (
      await callFunction("finalizeInventoryReservation", admin.token, {
        reservationId,
      })
    ).response.ok,
    "Payment finalization did not finalize reservation",
  );
  assert.equal(
    (
      await callFunction("finalizeInventoryReservation", admin.token, {
        reservationId,
      })
    ).data.result.idempotent,
    true,
    "Repeated payment finalization was not idempotent",
  );
  inventory = await firestore.collection("inventory").doc(sku).get();
  assert.equal(inventory.get("available"), 0);
  assert.equal(inventory.get("reserved"), 0);
  assert.equal(inventory.get("sold"), 1);

  await callFunction("receiveInventory", admin.token, {
    productId,
    variantId,
    sku,
    quantity: 1,
    reason: "Stock for expiry verification",
  });
  const expiryKey = `expire${suffix}`;
  const expiry = await callFunction("reserveInventory", customer.token, {
    idempotencyKey: expiryKey,
    lines: [{ sku, quantity: 1 }],
  });
  assert.ok(expiry.response.ok, "Expiry reservation failed");
  await firestore
    .collection("inventoryReservations")
    .doc(expiry.data.result.reservationId)
    .update({ reservedUntil: Timestamp.fromMillis(Date.now() - 1_000) });
  const cleanup = await callFunction("runInventoryExpiryCleanup", admin.token);
  assert.equal(
    cleanup.data.result.released,
    1,
    "Expired reservation was not released",
  );
  inventory = await firestore.collection("inventory").doc(sku).get();
  assert.equal(inventory.get("available"), 1);
  assert.equal(inventory.get("reserved"), 0);
  assert.equal(
    (
      await firestore
        .collection("inventoryReservations")
        .doc(expiry.data.result.reservationId)
        .get()
    ).get("status"),
    "EXPIRED",
  );
  console.log("Phase 8 inventory flow passed.");
} finally {
  await deleteApp(app);
}
