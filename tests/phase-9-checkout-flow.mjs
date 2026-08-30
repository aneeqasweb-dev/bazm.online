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

async function request(endpoint, body) {
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
async function token(refreshToken) {
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
  assert.ok(response.ok && data.id_token);
  return data.id_token;
}
async function call(name, idToken, data) {
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
  const signup = await request("accounts:signUp", {
    email: `phase9-${role}-${suffix}@example.test`,
    password: "Secure123",
    returnSecureToken: true,
  });
  assert.ok(signup.response.ok);
  assert.ok(
    (
      await call("completeRegistration", signup.data.idToken, {
        name: `Phase Nine ${role}`,
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
    token: await token(signup.data.refreshToken),
  };
}
const stamp = () => ({
  schemaVersion: 1,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});

try {
  const [customer, admin] = await Promise.all([
    account("CUSTOMER"),
    account("ADMIN"),
  ]);
  const categoryId = `p9-category-${suffix}`,
    productId = `p9-product-${suffix}`,
    variantId = "linen-m",
    sku = `P9-LINEN-${suffix}`;
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
      ...stamp(),
    });
  const media = [
    {
      path: `products/phase9/${suffix}.webp`,
      url: `http://127.0.0.1:9199/phase9/${suffix}.webp`,
      alt: "Phase nine linen",
      width: 1200,
      height: 1600,
      contentType: "image/webp",
      contentHash: `phase9-${suffix}-0123456789abcdef`,
      sortOrder: 0,
    },
  ];
  await firestore
    .collection("products")
    .doc(productId)
    .create({
      name: "Checkout Linen Shirt",
      slug: `checkout-linen-${suffix}`,
      description:
        "A resilient linen shirt used to verify immutable checkout order snapshots.",
      categoryId,
      categoryPath: [categoryId],
      brand: "Bazm",
      basePrice: { amountMinor: 5000, currency: "PKR" },
      media,
      tags: ["linen"],
      searchTokens: ["checkout", "linen"],
      ratingSummary: { average: 0, count: 0 },
      flags: { featured: false, newArrival: false },
      seo: { title: null, description: null },
      status: "PUBLISHED",
      publishedAt: FieldValue.serverTimestamp(),
      archivedAt: null,
      ...stamp(),
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
      ...stamp(),
    });
  assert.ok(
    (
      await call("receiveInventory", admin.token, {
        productId,
        variantId,
        sku,
        quantity: 2,
        reason: "Checkout test receipt",
      })
    ).response.ok,
  );
  assert.ok(
    (
      await call("addCartItem", customer.token, {
        productId,
        variantId,
        quantity: 1,
      })
    ).response.ok,
  );
  const address = {
    label: "Home",
    recipientName: "Phase Nine Customer",
    phone: "+923001234567",
    line1: "42 Bazaar Road",
    line2: null,
    area: "Gulberg",
    city: "Lahore",
    province: "PUNJAB",
    postalCode: "54000",
    deliveryInstructions: null,
  };
  const created = await call("createAddress", customer.token, address);
  assert.ok(created.response.ok);
  const addressId = created.data.result.id;
  const couponId = `p9-coupon-${suffix}`;
  await firestore
    .collection("coupons")
    .doc(couponId)
    .create({
      codeHash: "a".repeat(64),
      displayCode: "SAVE10",
      discount: { kind: "PERCENTAGE", percentage: 10 },
      minimumOrderAmount: null,
      maximumDiscountAmount: { amountMinor: 300, currency: "PKR" },
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 60_000),
      usageLimit: 1,
      perCustomerLimit: 1,
      redemptionCount: 0,
      status: "ACTIVE",
      archivedAt: null,
      ...stamp(),
    });
  const checkoutInput = {
    idempotencyKey: `checkout${suffix}`,
    shippingAddressId: addressId,
    billingAddressId: null,
    couponCode: "SAVE10",
    deliveryMethod: "STANDARD",
    paymentMethod: "CASH_ON_DELIVERY",
    customerNote: "Leave with reception",
  };
  const checkout = await call("createCheckout", customer.token, checkoutInput);
  assert.ok(checkout.response.ok, "Checkout failed");
  const orderId = checkout.data.result.orderId;
  assert.equal(
    (await call("createCheckout", customer.token, checkoutInput)).data.result
      .orderId,
    orderId,
    "Checkout duplicated order",
  );
  const order = await firestore.collection("orders").doc(orderId).get();
  assert.equal(order.get("status"), "PENDING_PAYMENT");
  assert.equal(order.get("items")[0].unitPrice.amountMinor, 5000);
  assert.equal(order.get("totals").discount.amountMinor, 300);
  assert.equal(order.get("shippingAddress").line1, address.line1);
  assert.equal(
    (
      await firestore
        .collection("carts")
        .doc(customer.uid)
        .collection("items")
        .get()
    ).empty,
    true,
    "Checkout did not clear cart",
  );
  await firestore
    .collection("products")
    .doc(productId)
    .update({ basePrice: { amountMinor: 9000, currency: "PKR" } });
  await firestore
    .collection("users")
    .doc(customer.uid)
    .collection("addresses")
    .doc(addressId)
    .update({ line1: "99 Changed Road" });
  assert.equal(
    (await firestore.collection("orders").doc(orderId).get()).get("items")[0]
      .unitPrice.amountMinor,
    5000,
    "Order price snapshot changed",
  );
  assert.equal(
    (await firestore.collection("orders").doc(orderId).get()).get(
      "shippingAddress",
    ).line1,
    address.line1,
    "Order address snapshot changed",
  );
  assert.equal(
    (await call("transitionOrder", customer.token, { orderId, status: "PAID" }))
      .response.ok,
    false,
    "Customer transitioned order",
  );
  assert.ok(
    (
      await call("transitionOrder", admin.token, {
        orderId,
        status: "PAID",
        trackingNumber: null,
        reason: "COD confirmed",
      })
    ).response.ok,
  );
  assert.equal(
    (await firestore.collection("inventory").doc(sku).get()).get("sold"),
    1,
    "Paid order did not finalize stock",
  );
  assert.equal(
    (
      await call("transitionOrder", admin.token, {
        orderId,
        status: "SHIPPED",
        trackingNumber: "PK-123",
        reason: "Invalid skip",
      })
    ).response.ok,
    false,
    "Invalid transition accepted",
  );
  assert.ok(
    (
      await call("transitionOrder", admin.token, {
        orderId,
        status: "PROCESSING",
        trackingNumber: null,
        reason: "Packing",
      })
    ).response.ok,
  );
  assert.ok(
    (
      await call("transitionOrder", admin.token, {
        orderId,
        status: "SHIPPED",
        trackingNumber: "PK-123",
        reason: "Courier pickup",
      })
    ).response.ok,
  );
  assert.ok(
    (
      await firestore
        .collection("auditLogs")
        .where("action", "==", "ORDER")
        .get()
    ).size >= 4,
    "Order events lack audit logs",
  );
  console.log("Phase 9 checkout flow passed.");
} finally {
  await deleteApp(app);
}
