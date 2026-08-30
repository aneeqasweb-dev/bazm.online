import assert from "node:assert/strict";

import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { encodeCursor } from "@bazm/domain";
import { createCoreRepositories } from "../functions/lib/data/core-repositories.js";
import { CoreModelService } from "../functions/lib/data/core-model-service.js";

const projectId = "demo-bazm-online";
const suffix = Date.now().toString();
const app = initializeApp({ projectId }, `phase-3-${suffix}`);
const firestore = getFirestore(app);
const repositories = createCoreRepositories(firestore);
const service = new CoreModelService(repositories);
const now = new Date("2026-08-29T12:00:00.000Z");

const media = {
  path: "products/phase-3/hero.webp",
  url: "https://example.test/products/phase-3/hero.webp",
  alt: "Black linen midi dress",
  width: 1200,
  height: 1600,
  contentType: "image/webp",
  contentHash: "0123456789abcdef0123456789abcdef",
  sortOrder: 0,
};

const address = {
  recipientName: "Phase Three Customer",
  phone: "+923001234567",
  line1: "42 Bazaar Road",
  line2: null,
  area: "Gulberg",
  city: "Lahore",
  province: "PUNJAB",
  postalCode: "54000",
  deliveryInstructions: null,
};

function product(name, slug) {
  return {
    name,
    slug,
    description:
      "A durable verified product fixture for Phase 3 persistence tests.",
    categoryId: "women-dresses",
    categoryPath: ["women", "women-dresses"],
    basePrice: { amountMinor: 4_999, currency: "PKR" },
    media: [media],
    tags: ["linen", "dress"],
    flags: { featured: true, newArrival: true },
    seo: {
      title: "Black Linen Midi Dress for Everyday Wear",
      description:
        "A breathable black linen midi dress with a relaxed, easy everyday silhouette.",
    },
    status: "PUBLISHED",
    publishedAt: now,
    archivedAt: null,
  };
}

try {
  const productAId = `phase3-product-a-${suffix}`;
  const productBId = `phase3-product-b-${suffix}`;
  const productA = await repositories.products.create(
    productAId,
    product("Linen Midi Dress", `linen-midi-dress-${suffix}`),
  );
  const productB = await repositories.products.create(
    productBId,
    product("Cotton Day Dress", `cotton-day-dress-${suffix}`),
  );

  assert.equal(typeof productA.createdAt.toDate, "function");
  assert.equal(typeof productA.updatedAt.toDate, "function");

  const publicProduct = await service.getPublishedProduct(productAId);
  assert.equal(publicProduct.id, productAId);
  assert.equal(publicProduct.name, "Linen Midi Dress");

  const firstPage = await repositories.products.list({
    page: { limit: 1, cursor: null },
    filters: [{ field: "status", operator: "==", value: "PUBLISHED" }],
    sort: { field: "createdAt", direction: "desc" },
  });
  assert.equal(firstPage.items.length, 1);
  assert.ok(firstPage.nextCursor, "A bounded first page must return a cursor.");

  const secondPage = await repositories.products.list({
    page: { limit: 1, cursor: firstPage.nextCursor },
    filters: [{ field: "status", operator: "==", value: "PUBLISHED" }],
    sort: { field: "createdAt", direction: "desc" },
  });
  assert.equal(secondPage.items.length, 1);
  assert.notEqual(firstPage.items[0].name, secondPage.items[0].name);

  await assert.rejects(
    repositories.products.list({
      page: {
        limit: 1,
        cursor: encodeCursor({ id: productAId, value: "tampered" }),
      },
      filters: [{ field: "status", operator: "==", value: "PUBLISHED" }],
      sort: { field: "createdAt", direction: "desc" },
    }),
    { code: "INVALID_ARGUMENT" },
  );

  const orderId = `phase3-order-${suffix}`;
  await repositories.orders.create(orderId, {
    userId: "phase3-customer",
    status: "PAID",
    items: [
      {
        productId: productAId,
        variantId: "linen-midi-black-m",
        productName: productA.name,
        sku: "W-DRS-LIN-BLK-M",
        color: "Black",
        size: "M",
        quantity: 1,
        unitPrice: { amountMinor: 4_999, currency: "PKR" },
        discountAmount: { amountMinor: 0, currency: "PKR" },
        taxAmount: { amountMinor: 0, currency: "PKR" },
        lineTotal: { amountMinor: 4_999, currency: "PKR" },
        media,
      },
    ],
    shippingAddress: address,
    billingAddress: address,
    totals: {
      subtotal: { amountMinor: 4_999, currency: "PKR" },
      discount: { amountMinor: 0, currency: "PKR" },
      shipping: { amountMinor: 0, currency: "PKR" },
      tax: { amountMinor: 0, currency: "PKR" },
      grandTotal: { amountMinor: 4_999, currency: "PKR" },
      currency: "PKR",
    },
    couponId: null,
    couponCode: null,
    paymentId: null,
    deliveryMethod: "STANDARD",
    policyVersion: "returns-14-days-v1",
    customerNote: null,
    adminNote: null,
    placedAt: now,
    archivedAt: null,
  });

  const updatedProduct = await repositories.products.update(productAId, {
    name: "Renamed Linen Midi Dress",
    basePrice: { amountMinor: 5_499, currency: "PKR" },
  });
  assert.equal(updatedProduct.name, "Renamed Linen Midi Dress");
  assert.equal(typeof updatedProduct.updatedAt.toDate, "function");

  const historicalOrder = await repositories.orders.getOrThrow(orderId);
  assert.equal(historicalOrder.items[0].productName, "Linen Midi Dress");
  assert.equal(historicalOrder.items[0].unitPrice.amountMinor, 4_999);

  const ledgerId = `phase3-ledger-${suffix}`;
  await repositories.inventoryTransactions.create(ledgerId, {
    sku: "W-DRS-LIN-BLK-M",
    type: "RECEIPT",
    delta: 10,
    reason: "Initial stock receipt",
    actorId: null,
    orderId: null,
    resultingAvailable: 10,
    correlationId: `phase3-${suffix}`,
  });
  await assert.rejects(
    repositories.inventoryTransactions.update(ledgerId, { reason: "Mutated" }),
    { code: "PRECONDITION_FAILED" },
  );

  assert.ok(
    productB,
    "The second product must be persisted for cursor coverage.",
  );
  console.log(
    "Phase 3 persistence passed repository CRUD, server timestamps, cursor pagination, immutable ledger, and order snapshot checks.",
  );
} finally {
  await deleteApp(app);
}
