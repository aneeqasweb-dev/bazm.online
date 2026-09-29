import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import {
  applicationDefault,
  deleteApp,
  initializeApp,
} from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { productDocumentSchema } from "@bazm/domain";

// A bounded, reversible edit to the owner's hosted sample catalog.
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

const app = initializeApp({
  credential: applicationDefault(),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
});
const db = getFirestore(app);
const ids = [
  "market-blue-black-check-shirt",
  "market-man-plaid-shirt",
  "market-man-short-sleeve-shirt",
  "market-men-check-shirt",
];
const apply = process.argv.includes("--apply");
const marker = db.doc("systemSeeds/remove-mens-casual-shirts-v1");
try {
  await db.runTransaction(async (transaction) => {
    const [previous, ...products] = await transaction.getAll(
      marker,
      ...ids.map((id) => db.doc(`products/${id}`)),
    );
    for (const product of products) {
      assert.ok(product.exists, `Missing product: ${product.id}`);
      assert.equal(product.get("categoryId"), "demo-mens-wear");
      assert.equal(
        product.get("status"),
        previous.exists ? "ARCHIVED" : "PUBLISHED",
      );
    }
    if (previous.exists) {
      console.log(
        "The four men's casual shirts are already archived. No changes.",
      );
      return;
    }
    const now = Timestamp.now();
    const updates = products.map((product) => {
      const data = product.data();
      const update = {
        status: "ARCHIVED",
        archivedAt: now,
        updatedAt: now,
        flags: { ...data.flags, featured: false, newArrival: false },
      };
      productDocumentSchema.parse({ ...data, ...update });
      return update;
    });
    console.log(
      JSON.stringify(
        {
          apply,
          archiveProducts: products.map((product) => ({
            id: product.id,
            name: product.get("name"),
          })),
        },
        null,
        2,
      ),
    );
    if (!apply) return;
    products.forEach((product, index) =>
      transaction.update(product.ref, updates[index]),
    );
    transaction.create(marker, {
      createdAt: now,
      productIds: ids,
      previous: products.map((product) => ({
        path: product.ref.path,
        data: product.data(),
      })),
    });
  });
} finally {
  await db.terminate();
  await deleteApp(app);
}
