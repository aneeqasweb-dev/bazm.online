import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { categoryDocumentSchema, productDocumentSchema } from "@bazm/domain";

// Restore the owner's preferred fashion edit. Archive only records from the
// superseded sample seed; never remove stock, orders, users or route registries.
for (const [key, value] of Object.entries(
  parseEnv(readFileSync("frontend/.env.local", "utf8")),
))
  process.env[key] ??= value;
assert.equal(
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  "bazmonline-staging-aneeqa",
);
assert.equal(process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS, "false");
assert.ok(!process.env.FIRESTORE_EMULATOR_HOST);
const db = getFirestore(
  initializeApp({
    credential: applicationDefault(),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  }),
);
const ref = db.doc("systemSeeds/fashion-curation-v1");
const seed = await db.doc("systemSeeds/marketplace-catalog-v1").get();
assert.ok(seed.exists, "The marketplace sample seed is required.");
if ((await ref.get()).exists) {
  console.log("Fashion curation already applied; no changes.");
  process.exit(0);
}
const original = seed.data();
const [products, categories] = await Promise.all([
  db.getAll(...original.productIds.map((id) => db.doc(`products/${id}`))),
  db.getAll(...original.categoryIds.map((id) => db.doc(`categories/${id}`))),
]);
const keep = new Set([
  "demo-women",
  "demo-mens-wear",
  "demo-shoes",
  "demo-bags",
]);
const order = [
  "demo-formal-wear",
  "demo-mens-wear",
  "demo-accessories",
  "demo-women",
  "demo-shoes",
  "demo-bags",
];
const now = Timestamp.now();
const writes = [];
const previous = [];
let retained = 0;
for (const document of products) {
  assert.ok(document.exists);
  const data = document.data();
  const selected = keep.has(data.categoryId);
  if (selected) retained++;
  const update = {
    status: selected ? "PUBLISHED" : "ARCHIVED",
    archivedAt: selected ? null : now,
    flags: { ...data.flags, featured: false, newArrival: selected },
    updatedAt: now,
  };
  productDocumentSchema.parse({ ...data, ...update });
  writes.push([document.ref, update]);
  previous.push({ path: document.ref.path, data });
}
assert.equal(retained, 18);
for (const document of categories) {
  assert.ok(document.exists);
  const data = document.data();
  const restored = original.previousCategories.find(
    (c) => c.id === document.id,
  )?.data;
  const active = order.includes(document.id);
  const update = {
    ...(restored ?? {}),
    status: active ? "ACTIVE" : "ARCHIVED",
    archivedAt: active ? null : now,
    sortOrder: active ? (order.indexOf(document.id) + 1) * 10 : data.sortOrder,
    updatedAt: now,
  };
  categoryDocumentSchema.parse({ ...data, ...update });
  writes.push([document.ref, update]);
  previous.push({ path: document.ref.path, data });
}
console.log(
  JSON.stringify({
    retainedAdditions: retained,
    archivedAdditions: products.length - retained,
    activeCollections: order.length,
    apply: process.argv.includes("--apply"),
  }),
);
if (!process.argv.includes("--apply")) process.exit(0);
await db.runTransaction(async (tx) => {
  if ((await tx.get(ref)).exists) return;
  const current = await tx.getAll(...writes.map(([document]) => document));
  for (let index = 0; index < current.length; index++) {
    const before = [...products, ...categories][index];
    assert.ok(
      current[index].updateTime.isEqual(before.updateTime),
      `Catalog changed during review: ${before.id}`,
    );
  }
  for (const [document, update] of writes) tx.update(document, update);
  tx.create(ref, {
    previous,
    retainedProductIds: products
      .filter((p) => keep.has(p.data().categoryId))
      .map((p) => p.id),
    createdAt: now,
  });
});
console.log("Fashion edit restored: 30 sample products in six collections.");
