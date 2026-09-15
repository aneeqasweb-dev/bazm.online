import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { productDocumentSchema } from "@bazm/domain";

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
const labels = [
  ["market-man-plaid-shirt", "Everyday Plaid Shirt"],
  ["market-man-short-sleeve-shirt", "Blue Floral Short-Sleeve Shirt"],
  ["market-men-check-shirt", "Teal Check Shirt"],
  ["market-golden-shoes-woman", "Gold Evening Heels"],
  ["market-women-handbag-black", "Black Structured Handbag"],
];
const marker = db.doc("systemSeeds/fashion-labels-v1");
const apply = process.argv.includes("--apply");
await db.runTransaction(async (tx) => {
  if ((await tx.get(marker)).exists) {
    console.log("Fashion labels already updated.");
    return;
  }
  assert.ok((await tx.get(db.doc("systemSeeds/fashion-curation-v1"))).exists);
  const docs = await tx.getAll(
    ...labels.map(([id]) => db.doc(`products/${id}`)),
  );
  const now = Timestamp.now();
  const updates = docs.map((document, i) => {
    assert.equal(document.get("status"), "PUBLISHED");
    const data = document.data();
    const name = labels[i][1];
    const update = {
      name,
      seo: { ...data.seo, title: `${name} | Bazm` },
      media: data.media.map((image) => ({ ...image, alt: name })),
      searchTokens: [
        ...new Set([
          ...data.searchTokens,
          ...name
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter(Boolean),
        ]),
      ],
      updatedAt: now,
    };
    productDocumentSchema.parse({ ...data, ...update });
    return update;
  });
  console.log(
    JSON.stringify({ products: labels.map(([, name]) => name), apply }),
  );
  if (!apply) return;
  docs.forEach((document, i) => tx.update(document.ref, updates[i]));
  tx.create(marker, {
    previous: docs.map((document) => ({
      id: document.id,
      data: document.data(),
    })),
    createdAt: now,
  });
});
