import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { v2 as cloudinary } from "cloudinary";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const envPath = new URL("../frontend/.env.local", import.meta.url);
const imagePath = fileURLToPath(
  new URL("./assets/emerald-noor-kurta.png", import.meta.url),
);

function loadLocalEnvironment() {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2];
    }
  }
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

loadLocalEnvironment();

const projectId = required("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
if (projectId !== "bazmonline-staging-aneeqa") {
  throw new Error(
    `Refusing to seed ${projectId}. This command is staging-only.`,
  );
}
if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== "false") {
  throw new Error("Refusing to seed while emulator routing is enabled.");
}

cloudinary.config({
  cloud_name: required("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"),
  api_key: required("CLOUDINARY_API_KEY"),
  api_secret: required("CLOUDINARY_API_SECRET"),
  secure: true,
});

const app = initializeApp({ credential: applicationDefault(), projectId });
const database = getFirestore(app);
const seedRef = database.collection("systemSeeds").doc("portfolio-catalog-v1");

if ((await seedRef.get()).exists) {
  console.log("Portfolio catalog v1 is already seeded; no changes made.");
  process.exit(0);
}

const imageBytes = readFileSync(imagePath);
const contentHash = createHash("sha256").update(imageBytes).digest("hex");
const uploaded = await cloudinary.uploader.upload(imagePath, {
  public_id: "bazm/demo/emerald-noor-kurta",
  overwrite: false,
  resource_type: "image",
  tags: ["bazm", "portfolio-demo", "seed-v1"],
});

const categoryId = "demo-formal-wear";
const productId = "demo-emerald-noor-kurta";
const variantId = "demo-emerald-medium";
const sku = "BZ-NOOR-EMR-M";
const media = {
  path: uploaded.public_id,
  url: uploaded.secure_url,
  alt: "Emerald Noor embroidered formal kurta",
  width: uploaded.width,
  height: uploaded.height,
  contentType: `image/${uploaded.format === "jpg" ? "jpeg" : uploaded.format}`,
  contentHash,
  sortOrder: 0,
};

await database.runTransaction(async (transaction) => {
  if ((await transaction.get(seedRef)).exists) return;

  const categoryRef = database.collection("categories").doc(categoryId);
  const productRef = database.collection("products").doc(productId);
  const variantRef = productRef.collection("variants").doc(variantId);

  transaction.create(categoryRef, {
    name: "Formal Wear",
    slug: "formal-wear",
    parentId: null,
    depth: 0,
    sortOrder: 10,
    image: media,
    seo: {
      title: "Formal Wear Collection | Bazm",
      description:
        "Explore refined Pakistani formal wear designed for celebrations, dinners, and memorable gatherings.",
    },
    status: "ACTIVE",
    archivedAt: null,
    schemaVersion: 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  transaction.create(
    database.collection("slugRegistry").doc("category_formal-wear"),
    {
      type: "CATEGORY",
      ownerId: categoryId,
      slug: "formal-wear",
      createdAt: FieldValue.serverTimestamp(),
    },
  );
  transaction.create(productRef, {
    name: "Emerald Noor Kurta",
    slug: "emerald-noor-kurta",
    description:
      "A refined emerald formal kurta finished with delicate antique-gold embroidery. Its clean silhouette and soft silk-blend drape make it an elegant choice for festive evenings.",
    categoryId,
    categoryPath: [categoryId],
    brand: "Bazm",
    basePrice: { amountMinor: 1290000, currency: "PKR" },
    media: [media],
    tags: ["formal", "embroidered", "emerald", "kurta"],
    searchTokens: ["emerald", "noor", "kurta", "bazm", "formal", "embroidered"],
    ratingSummary: { average: 4.8, count: 12 },
    flags: { featured: true, newArrival: true },
    seo: {
      title: "Emerald Noor Embroidered Kurta | Bazm",
      description:
        "Shop the Emerald Noor formal kurta with antique-gold embroidery, an elegant Pakistani outfit for festive evenings.",
    },
    status: "PUBLISHED",
    publishedAt: FieldValue.serverTimestamp(),
    archivedAt: null,
    schemaVersion: 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  transaction.create(
    database.collection("slugRegistry").doc("product_emerald-noor-kurta"),
    {
      type: "PRODUCT",
      ownerId: productId,
      slug: "emerald-noor-kurta",
      createdAt: FieldValue.serverTimestamp(),
    },
  );
  transaction.create(variantRef, {
    productId,
    sku,
    color: "Emerald",
    size: "Medium",
    priceOverride: null,
    media: [],
    isActive: true,
    schemaVersion: 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  transaction.create(database.collection("skuRegistry").doc(sku), {
    productId,
    variantId,
    sku,
    createdAt: FieldValue.serverTimestamp(),
  });
  transaction.create(database.collection("inventory").doc(sku), {
    sku,
    productId,
    variantId,
    available: 15,
    reserved: 0,
    sold: 0,
    returned: 0,
    damaged: 0,
    reorderPoint: 3,
    reservedUntil: null,
    schemaVersion: 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  transaction.create(seedRef, {
    version: 1,
    categoryIds: [categoryId],
    productIds: [productId],
    cloudinaryPublicIds: [uploaded.public_id],
    createdAt: FieldValue.serverTimestamp(),
  });
});

console.log(
  `Seeded 1 category, 1 published product, and 15 inventory units into ${projectId}.`,
);
console.log(`Source asset: ${repoRoot}/scripts/assets/emerald-noor-kurta.png`);
