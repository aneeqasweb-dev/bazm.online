import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  DemoPaymentService,
  demoPaymentRequestSchema,
} from "../functions/lib/payments/demo-payment-service.js";
import { OrderService } from "../functions/lib/orders/order-service.js";
import { InventoryService } from "../functions/lib/inventory/inventory-service.js";

assert.match(
  process.env.FIRESTORE_EMULATOR_HOST ?? "",
  /^(127\.0\.0\.1|localhost):\d+$/,
  "Run only against a local Firestore emulator.",
);
const app = initializeApp(
  { projectId: "demo-bazm-payments" },
  `demo-payments-${Date.now()}`,
);
const db = getFirestore(app);
const service = new DemoPaymentService(db);
const orders = new OrderService(db);
const inventory = new InventoryService(db);
const suffix = Date.now().toString();
const stamp = () => ({
  schemaVersion: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
});
const money = (amountMinor) => ({ amountMinor, currency: "PKR" });
async function seed(label, method = "CARD") {
  const userId = `demo-${label}-${suffix}`;
  const { id: addressId } = await orders.createAddress(userId, {
    label: "Home",
    recipientName: "Demo Shopper",
    phone: "+923001234567",
    line1: "12 Demo Road",
    line2: null,
    area: "Gulberg",
    city: "Lahore",
    province: "PUNJAB",
    postalCode: "54000",
    deliveryInstructions: null,
  });
  const skus = [];
  for (let i = 0; i < 2; i++) {
    const productId = `demo-product-${label}-${suffix}-${i}`,
      variantId = `variant-${i}`,
      sku = `DEMO-${label.toUpperCase()}-${suffix}-${i}`;
    const media = {
      path: `products/demo/${productId}.webp`,
      url: `https://res.cloudinary.com/demo/image/upload/${productId}.webp`,
      alt: "Demo item",
      width: 1200,
      height: 1600,
      contentType: "image/webp",
      contentHash: "a".repeat(64),
      sortOrder: 0,
    };
    await db
      .collection("products")
      .doc(productId)
      .create({
        name: `Demo item ${i}`,
        slug: `demo-item-${label}-${suffix}-${i}`,
        description:
          "A sample product for isolated demo payment integration testing.",
        categoryId: "demo-category",
        categoryPath: ["demo-category"],
        brand: "Bazm",
        basePrice: money(250000),
        media: [media],
        tags: ["demo"],
        searchTokens: ["demo"],
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
    await inventory.receive(
      { productId, variantId, sku, quantity: 10, reason: "Demo test stock" },
      userId,
    );
    await db
      .collection("carts")
      .doc(userId)
      .collection("items")
      .doc(variantId)
      .create({
        productId,
        variantId,
        requestedQuantity: 1,
        snapshot: {
          name: `Demo item ${i}`,
          slug: `demo-item-${label}-${suffix}-${i}`,
          brand: "Bazm",
          image: media,
          price: money(1),
          sku,
          color: "Ivory",
          size: "M",
        },
        ...stamp(),
      });
    skus.push(sku);
  }
  return {
    userId,
    skus,
    request: {
      checkout: {
        idempotencyKey: `demo-${label}-${suffix}`,
        shippingAddressId: addressId,
        billingAddressId: null,
        couponCode: null,
        deliveryMethod: "STANDARD",
        paymentMethod: method,
        customerNote: "Demo integration test",
      },
      ...(method === "CARD" ? {} : { mobileNumber: "03111234567" }),
    },
  };
}
try {
  for (const method of ["EASYPAISA", "JAZZCASH", "CARD"]) {
    const fixture = await seed(method.toLowerCase(), method);
    const parsed = demoPaymentRequestSchema.parse(fixture.request);
    const { orderId } = await service.createOrder(fixture.userId, parsed);
    const started = Date.now();
    const [paid, concurrent] = await Promise.all([
      service.complete(fixture.userId, orderId),
      service.complete(fixture.userId, orderId),
    ]);
    assert.ok(Date.now() - started >= 1900, "Payment delay is missing");
    assert.deepEqual(paid, concurrent, "Concurrent payment retries diverged");
    assert.equal(paid.status, "PAID");
    assert.equal(paid.method, method);
    assert.match(paid.paymentId, /^pi_demo_[a-f0-9]{32}$/);
    assert.match(paid.transactionId, /^txn_demo_[a-f0-9]{32}$/);
    assert.equal(
      paid.amount.amountMinor,
      500000,
      "Must use server prices, not stale cart snapshots",
    );
    const order = (await db.collection("orders").doc(orderId).get()).data();
    const payment = (
      await db.collection("payments").doc(paid.paymentId).get()
    ).data();
    assert.equal(order.status, "PAID");
    assert.equal(order.isDemo, true);
    assert.equal(order.paymentMethod, method);
    assert.equal(payment.status, "PAID");
    assert.equal(payment.provider, "DEMO");
    assert.equal(payment.method, method);
    assert.equal(payment.transactionId, paid.transactionId);
    assert.equal(order.items.length, 2);
    assert.equal(order.shippingAddress.city, "Lahore");
    assert.equal(payment.mobileNumber, undefined);
    assert.equal(payment.cardNumber, undefined);
    assert.equal(payment.cvv, undefined);
    assert.deepEqual(await service.complete(fixture.userId, orderId), paid);
    assert.equal(
      (await service.createOrder(fixture.userId, parsed)).orderId,
      orderId,
    );
    assert.equal(
      (await service.confirmation(fixture.userId, orderId)).transactionId,
      paid.transactionId,
    );
    for (const sku of fixture.skus) {
      const stock = (await db.collection("inventory").doc(sku).get()).data();
      assert.equal(stock.sold, 1);
      assert.equal(stock.reserved, 0);
      assert.equal(stock.available, 9);
    }
    assert.equal(
      (
        await db
          .collection("carts")
          .doc(fixture.userId)
          .collection("items")
          .get()
      ).empty,
      true,
    );
    await assert.rejects(
      service.complete("different-user", orderId),
      (e) => e.code === "FORBIDDEN",
    );
    console.log(
      `PASS ${method}: paid records, 2-second delay, server totals, multi-item inventory, concurrent retries, receipt and ownership`,
    );
  }
  const fixture = await seed("boundaries");
  assert.equal(
    demoPaymentRequestSchema.safeParse({
      ...fixture.request,
      cardNumber: "4242424242424242",
    }).success,
    false,
  );
  assert.equal(
    demoPaymentRequestSchema.safeParse({ ...fixture.request, status: "PAID" })
      .success,
    false,
  );
  assert.equal(
    demoPaymentRequestSchema.safeParse({
      ...fixture.request,
      checkout: { ...fixture.request.checkout, amount: 1 },
    }).success,
    false,
  );
  assert.equal(
    demoPaymentRequestSchema.safeParse({
      ...fixture.request,
      checkout: { ...fixture.request.checkout, paymentMethod: "EASYPAISA" },
    }).success,
    false,
  );
  const { orderId } = await service.createOrder(
    fixture.userId,
    fixture.request,
  );
  const orderRef = db.collection("orders").doc(orderId),
    order = (await orderRef.get()).data(),
    paymentRef = db.collection("payments").doc(order.paymentId);
  await paymentRef.update({ provider: "STRIPE" });
  await assert.rejects(
    service.complete(fixture.userId, orderId),
    (e) => e.code === "PRECONDITION_FAILED",
  );
  await paymentRef.update({ provider: "DEMO", amount: money(1) });
  await assert.rejects(
    service.complete(fixture.userId, orderId),
    (e) => e.code === "PRECONDITION_FAILED",
  );
  await paymentRef.update({ amount: order.totals.grandTotal });
  await inventory.release(
    order.reservationId,
    fixture.userId,
    "Demo test release",
  );
  await assert.rejects(
    service.complete(fixture.userId, orderId),
    (e) => e.code === "PRECONDITION_FAILED",
  );
  assert.equal((await paymentRef.get()).get("status"), "PENDING");
  await orderRef.update({ status: "CANCELLED" });
  await assert.rejects(
    service.complete(fixture.userId, orderId),
    (e) => e.code === "PRECONDITION_FAILED",
  );
  assert.equal((await db.collection("emailDeliveries").get()).empty, true);
  console.log(
    "PASS input boundaries, live-provider isolation, amount mismatch, released inventory, cancellation and no demo emails",
  );
} finally {
  await db.terminate();
  await deleteApp(app);
}
