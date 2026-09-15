import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { categoryDocumentSchema, productDocumentSchema } from "@bazm/domain";

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
const originalOnly = process.argv.includes("--original-only");
const apply = process.argv.includes("--apply");
const marker = db.doc("systemSeeds/adult-collections-v1");
await db.runTransaction(async (tx) => {
  const applied = await tx.get(marker);
  if (applied.exists) {
    assert.equal(
      applied.get("originalOnly"),
      originalOnly,
      "A different curation was already applied; review it before changing the catalog again.",
    );
    console.log("Adult collection edit already applied; no changes.");
    return;
  }
  const seed = await tx.get(db.doc("systemSeeds/fashion-curation-v1"));
  assert.ok(seed.exists);
  const productIds = [
    ...seed.get("retainedProductIds"),
    "demo-champagne-zari-potli",
    "demo-midnight-mehr-clutch",
    "demo-pearl-noor-earrings",
  ];
  const categoryIds = [
    "demo-formal-wear",
    "demo-mens-wear",
    "demo-accessories",
    "demo-women",
    "demo-shoes",
    "demo-bags",
  ];
  const docs = await tx.getAll(
    ...productIds.map((id) => db.doc(`products/${id}`)),
    ...categoryIds.map((id) => db.doc(`categories/${id}`)),
  );
  const products = docs.slice(0, productIds.length);
  const categories = docs.slice(productIds.length);
  const now = Timestamp.now();
  const writes = [];
  const archived = [];
  for (const product of products) {
    assert.ok(product.exists);
    const data = product.data();
    let update;
    if (product.id.startsWith("market-")) {
      const keep =
        !originalOnly &&
        ["demo-mens-wear", "demo-bags"].includes(data.categoryId);
      if (keep) continue;
      update = {
        status: "ARCHIVED",
        archivedAt: now,
        flags: { featured: false, newArrival: false },
        updatedAt: now,
      };
      archived.push(data.name);
    } else if (product.id !== "demo-pearl-noor-earrings") {
      update = {
        categoryId: "demo-bags",
        categoryPath: ["demo-bags"],
        updatedAt: now,
      };
    } else continue;
    productDocumentSchema.parse({ ...data, ...update });
    writes.push([product, update]);
  }
  const order = [
    "demo-formal-wear",
    "demo-mens-wear",
    "demo-bags",
    "demo-accessories",
  ];
  const names = {
    "demo-formal-wear": "Women",
    "demo-mens-wear": "Men",
    "demo-bags": "Bags",
    "demo-accessories": "Accessories",
  };
  const images = {
    "demo-bags": products
      .find((p) => p.id === "demo-champagne-zari-potli")
      .get("media")[0],
    "demo-accessories": products
      .find((p) => p.id === "demo-pearl-noor-earrings")
      .get("media")[0],
  };
  for (const category of categories) {
    assert.ok(category.exists);
    const data = category.data();
    const active = order.includes(category.id);
    const update = {
      status: active ? "ACTIVE" : "ARCHIVED",
      archivedAt: active ? null : now,
      updatedAt: now,
      ...(active
        ? {
            name: names[category.id],
            sortOrder: (order.indexOf(category.id) + 1) * 10,
            seo: { ...data.seo, title: `${names[category.id]} | Bazm` },
          }
        : {}),
      ...(images[category.id] ? { image: images[category.id] } : {}),
    };
    categoryDocumentSchema.parse({ ...data, ...update });
    writes.push([category, update]);
  }
  console.log(
    JSON.stringify({
      originalOnly,
      apply,
      archiveProducts: archived,
      activeCollections: Object.values(names),
      expectedProducts: originalOnly ? 12 : 19,
    }),
  );
  if (!apply) return;
  for (const [document, update] of writes) tx.update(document.ref, update);
  tx.create(marker, {
    originalOnly,
    createdAt: now,
    previous: writes.map(([document]) => ({
      path: document.ref.path,
      data: document.data(),
    })),
  });
});
