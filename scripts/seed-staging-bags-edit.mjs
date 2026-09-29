import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import {
  applicationDefault,
  deleteApp,
  initializeApp,
} from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { v2 as cloudinary } from "cloudinary";
import {
  categoryDocumentSchema,
  inventoryDocumentSchema,
  productDocumentSchema,
  productVariantDocumentSchema,
} from "@bazm/domain";

for (const [key, value] of Object.entries(
  parseEnv(readFileSync("frontend/.env.local", "utf8")),
))
  process.env[key] ??= value;
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
assert.equal(projectId, "bazmonline-staging-aneeqa");
assert.equal(process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS, "false");
assert.ok(!process.env.FIRESTORE_EMULATOR_HOST);
const required = (name) => {
  assert.ok(process.env[name]?.trim(), `${name} is required`);
  return process.env[name].trim();
};
const app = initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore(app);
const marker = db.doc("systemSeeds/bags-edit-v1");
const categoryRef = db.doc("categories/demo-bags");
const definitions = JSON.parse(
  readFileSync("scripts/bags-edit-source.json", "utf8"),
);
assert.equal(definitions.length, 6);
const items = definitions.map((item) => ({
  ...item,
  id: `demo-${item.slug}`,
  variantId: `demo-${item.slug}-os`,
  sku: `BZ-BAG-${item.code}-OS`,
}));
assert.equal(new Set(items.map((item) => item.slug)).size, items.length);
const refs = items.flatMap((item) => [
  db.doc(`products/${item.id}`),
  db.doc(`products/${item.id}/variants/${item.variantId}`),
  db.doc(`slugRegistry/product_${item.slug}`),
  db.doc(`skuRegistry/${item.sku}`),
  db.doc(`inventory/${item.sku}`),
]);
const apply = process.argv.includes("--apply");

try {
  if ((await marker.get()).exists) {
    const products = await db.getAll(
      ...items.map((item) => db.doc(`products/${item.id}`)),
    );
    assert.ok(
      products.every((product) => product.exists),
      "An existing edit is incomplete; review it before retrying.",
    );
    console.log("The six-bag edit is already published; no changes.");
  } else {
    const [category, ...existing] = await db.getAll(categoryRef, ...refs);
    assert.ok(category.exists);
    assert.equal(
      categoryDocumentSchema.parse(category.data()).status,
      "ACTIVE",
    );
    assert.ok(
      existing.every((document) => !document.exists),
      "A product, SKU or slug already exists; refusing to overwrite.",
    );
    for (const item of items) {
      item.imagePath = `scripts/assets/bags-edit-v1/${item.slug}.png`;
      item.hash = createHash("sha256")
        .update(readFileSync(item.imagePath))
        .digest("hex");
    }
    console.log(
      JSON.stringify(
        {
          projectId,
          apply,
          addBags: items.map(({ name, priceMinor, color }) => ({
            name,
            samplePricePkr: priceMinor / 100,
            color,
          })),
          sampleStockPerBag: 12,
        },
        null,
        2,
      ),
    );
    if (apply) {
      cloudinary.config({
        cloud_name: required("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"),
        api_key: required("CLOUDINARY_API_KEY"),
        api_secret: required("CLOUDINARY_API_SECRET"),
        secure: true,
      });
      // Stable IDs and overwrite:false make a retry after an interrupted upload safe.
      for (const item of items) {
        const upload = await cloudinary.uploader.upload(item.imagePath, {
          public_id: `bazm/demo/bags-edit-v1/${item.slug}`,
          overwrite: false,
          resource_type: "image",
          tags: ["bazm", "portfolio-demo", "bags-edit-v1"],
          timeout: 90000,
        });
        assert.ok(upload.secure_url?.startsWith("https://res.cloudinary.com/"));
        item.media = {
          path: upload.public_id,
          url: upload.secure_url,
          alt: `${item.name} in ${item.color.toLowerCase()} on a warm cream studio background`,
          width: upload.width,
          height: upload.height,
          contentType: "image/png",
          contentHash: item.hash,
          sortOrder: 0,
        };
        console.log(`Uploaded ${item.name}`);
      }
      await db.runTransaction(async (transaction) => {
        const [applied, currentCategory, ...current] = await transaction.getAll(
          marker,
          categoryRef,
          ...refs,
        );
        if (applied.exists) return;
        assert.equal(
          categoryDocumentSchema.parse(currentCategory.data()).status,
          "ACTIVE",
        );
        assert.ok(
          current.every((document) => !document.exists),
          "Catalog changed during upload; refusing to overwrite.",
        );
        const now = Timestamp.now();
        const metadata = { schemaVersion: 1, createdAt: now, updatedAt: now };
        for (const item of items) {
          const product = {
            name: item.name,
            slug: item.slug,
            description: item.description,
            categoryId: "demo-bags",
            categoryPath: ["demo-bags"],
            brand: "Bazm",
            basePrice: { amountMinor: item.priceMinor, currency: "PKR" },
            media: [item.media],
            tags: item.tags,
            searchTokens: [
              ...new Set(
                [item.name, item.color, "Bazm", ...item.tags]
                  .join(" ")
                  .toLowerCase()
                  .match(/[a-z0-9]+/g),
              ),
            ],
            ratingSummary: { average: 0, count: 0 },
            flags: { featured: false, newArrival: true },
            seo: {
              title: `${item.name} | Bazm`,
              description: item.description.split(". ")[0].slice(0, 160),
            },
            status: "PUBLISHED",
            publishedAt: now,
            archivedAt: null,
            ...metadata,
          };
          const variant = {
            productId: item.id,
            sku: item.sku,
            color: item.color,
            size: "One Size",
            priceOverride: null,
            media: [],
            isActive: true,
            ...metadata,
          };
          const inventory = {
            sku: item.sku,
            productId: item.id,
            variantId: item.variantId,
            available: 12,
            reserved: 0,
            sold: 0,
            returned: 0,
            damaged: 0,
            reorderPoint: 3,
            reservedUntil: null,
            ...metadata,
          };
          productDocumentSchema.parse(product);
          productVariantDocumentSchema.parse(variant);
          inventoryDocumentSchema.parse(inventory);
          transaction.create(db.doc(`products/${item.id}`), product);
          transaction.create(
            db.doc(`products/${item.id}/variants/${item.variantId}`),
            variant,
          );
          transaction.create(db.doc(`inventory/${item.sku}`), inventory);
          transaction.create(db.doc(`slugRegistry/product_${item.slug}`), {
            type: "PRODUCT",
            ownerId: item.id,
            slug: item.slug,
            createdAt: now,
          });
          transaction.create(db.doc(`skuRegistry/${item.sku}`), {
            productId: item.id,
            variantId: item.variantId,
            sku: item.sku,
            createdAt: now,
          });
        }
        transaction.create(marker, {
          createdAt: now,
          productIds: items.map((item) => item.id),
          cloudinaryPublicIds: items.map((item) => item.media.path),
          source: "Original AI-generated Bazm demo bags",
          samplePrices: true,
        });
      });
      console.log(
        "Published six original Bazm demo bags with images, variants and sample inventory.",
      );
    }
  }
} finally {
  await db.terminate();
  await deleteApp(app);
}
