import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { v2 as cloudinary } from "cloudinary";
import {
  productDocumentSchema,
  productVariantDocumentSchema,
  inventoryDocumentSchema,
} from "@bazm/domain";

const env = parseEnv(
  readFileSync(new URL("../frontend/.env.local", import.meta.url), "utf8"),
);
for (const [key, value] of Object.entries(env)) process.env[key] ??= value;
const required = (key) => {
  if (!process.env[key]?.trim()) throw new Error(`${key} is required.`);
  return process.env[key].trim();
};
const projectId = required("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
if (
  projectId !== "bazmonline-staging-aneeqa" ||
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== "false"
) {
  throw new Error("This catalog is for the hosted Bazm staging demo only.");
}
const definitions = [
  {
    slug: "rose-ayla-suit",
    name: "Rose Ayla Suit",
    categoryId: "demo-formal-wear",
    price: 1195000,
    color: "Dusty Rose",
    code: "AYLA-RSE",
    tags: ["embroidered", "three-piece", "rose", "kurta"],
    description:
      "Soft dusty-rose tones meet delicate floral embroidery in this three-piece ensemble. A long kurta, matching straight trousers and a flowing chiffon dupatta come together for intimate celebrations and evening gatherings.",
  },
  {
    slug: "ivory-sahar-set",
    name: "Ivory Sahar Set",
    categoryId: "demo-formal-wear",
    price: 1095000,
    color: "Ivory",
    code: "SAHAR-IVR",
    tags: ["cotton", "three-piece", "ivory", "embroidered", "kurta"],
    description:
      "An ivory cotton ensemble with tonal embroidery and a light, flowing dupatta. The long kurta and straight trousers create an effortless silhouette for daytime occasions and relaxed celebrations.",
  },
  {
    slug: "sage-inaya-suit",
    name: "Sage Inaya Suit",
    categoryId: "demo-formal-wear",
    price: 1395000,
    color: "Sage",
    code: "INAYA-SGE",
    tags: ["embroidered", "three-piece", "sage", "organza", "kurta"],
    description:
      "A soft sage-green three-piece set finished with delicate ivory floral embroidery. Matching trousers and a sheer organza dupatta add a graceful finish for dinners, festivities and memorable afternoons.",
  },
  {
    slug: "midnight-sitara-set",
    name: "Midnight Sitara Set",
    categoryId: "demo-formal-wear",
    price: 1595000,
    color: "Black",
    code: "SITARA-BLK",
    tags: ["formal", "three-piece", "black", "embroidered", "kurta"],
    description:
      "A midnight-black occasion ensemble with antique-gold detailing along the neckline and cuffs. A long kurta, matching trousers and a flowing chiffon dupatta create an elegant evening look.",
  },
  {
    slug: "sand-raahil-kurta",
    name: "Sand Raahil Kurta",
    categoryId: "demo-mens-wear",
    price: 645000,
    color: "Sand",
    code: "RAAHIL-SND",
    tags: ["linen", "two-piece", "menswear", "sand", "kurta"],
    description:
      "A sand-toned linen kurta with a clean band collar and subtle texture. Paired with matching straight trousers, this two-piece set brings relaxed polish to daytime gatherings and everyday dressing.",
  },
  {
    slug: "navy-azlan-kurta",
    name: "Navy Azlan Kurta",
    categoryId: "demo-mens-wear",
    price: 745000,
    color: "Navy",
    code: "AZLAN-NVY",
    tags: ["cotton", "two-piece", "menswear", "navy", "kurta"],
    description:
      "Deep navy cotton, a refined band collar and an understated button placket. This kurta and matching straight-trouser set is an easy choice for family gatherings and evening occasions.",
  },
  {
    slug: "pearl-noor-earrings",
    name: "Pearl Noor Earrings",
    categoryId: "demo-accessories",
    price: 285000,
    color: "Pearl Gold",
    code: "NOOR-PRL",
    tags: ["jewellery", "jhumka", "pearl", "gold", "earrings"],
    description:
      "Antique-gold jhumka earrings with delicate ivory pearl fringes and intricate detailing. An elegant finishing touch for embroidered ensembles and occasion dressing. Sold as a pair.",
  },
  {
    slug: "champagne-zari-potli",
    name: "Champagne Zari Potli",
    categoryId: "demo-accessories",
    price: 395000,
    color: "Champagne",
    code: "ZARI-CHM",
    tags: ["accessories", "bag", "embroidered", "champagne", "potli"],
    description:
      "A champagne-gold embroidered silk potli with a drawstring closure, pearl tassels and a softly structured base. Carry your small essentials in a beautiful companion for festive evenings.",
  },
].map((item) => ({
  ...item,
  id: `demo-${item.slug}`,
  sizes:
    item.categoryId === "demo-accessories"
      ? ["One Size"]
      : ["Small", "Medium", "Large"],
}));

const database = getFirestore(
  initializeApp(
    { credential: applicationDefault(), projectId },
    "portfolio-catalog-v3",
  ),
);
const seedRef = database.collection("systemSeeds").doc("portfolio-catalog-v3");
if ((await seedRef.get()).exists) {
  console.log("Portfolio catalog v3 is already seeded; no changes made.");
  process.exit(0);
}
const originalIds = [
  "demo-emerald-noor-kurta",
  "demo-ruby-meher-ensemble",
  "demo-ivory-zayn-waistcoat",
  "demo-midnight-mehr-clutch",
];
const categoryIds = [...new Set(definitions.map((item) => item.categoryId))];
const prerequisiteRefs = [
  ...originalIds.map((id) => database.collection("products").doc(id)),
  ...categoryIds.map((id) => database.collection("categories").doc(id)),
];
const prerequisites = await database.getAll(...prerequisiteRefs);
if (prerequisites.some((doc) => !doc.exists))
  throw new Error("Seed v1 and v2 must exist before v3.");
const newRefs = definitions.flatMap((item) => [
  database.collection("products").doc(item.id),
  database.collection("slugRegistry").doc(`product_${item.slug}`),
]);
if ((await database.getAll(...newRefs)).some((doc) => doc.exists))
  throw new Error(
    "A new product ID or slug already exists; refusing to overwrite.",
  );
for (const item of definitions) {
  item.imagePath = fileURLToPath(
    new URL(`./assets/${item.slug}.png`, import.meta.url),
  );
  item.hash = createHash("sha256")
    .update(readFileSync(item.imagePath))
    .digest("hex");
}
console.log(
  JSON.stringify(
    {
      projectId,
      addProducts: definitions.map(({ name, sizes }) => ({ name, sizes })),
      updateCategoryImages: categoryIds,
      curateExistingProducts: originalIds,
    },
    null,
    2,
  ),
);
if (!process.argv.includes("--apply")) {
  console.log("Preview only. Run with --apply to publish the sample catalog.");
  process.exit(0);
}
cloudinary.config({
  cloud_name: required("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"),
  api_key: required("CLOUDINARY_API_KEY"),
  api_secret: required("CLOUDINARY_API_SECRET"),
  secure: true,
});
for (const item of definitions) {
  const parameters = {
    public_id: `bazm/demo/${item.slug}`,
    overwrite: false,
    tags: "bazm,portfolio-demo,seed-v3",
    timestamp: Math.floor(Date.now() / 1000),
  };
  const form = new FormData();
  for (const [key, value] of Object.entries(parameters))
    form.set(key, String(value));
  form.set("api_key", required("CLOUDINARY_API_KEY"));
  form.set(
    "signature",
    cloudinary.utils.api_sign_request(
      parameters,
      required("CLOUDINARY_API_SECRET"),
    ),
  );
  form.set(
    "file",
    new Blob([readFileSync(item.imagePath)], { type: "image/png" }),
    `${item.slug}.png`,
  );
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${required("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME")}/image/upload`,
    {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(90000),
    },
  );
  const upload = await response.json();
  if (!response.ok || !upload.secure_url)
    throw new Error(`Upload failed for ${item.slug}: HTTP ${response.status}`);
  item.media = {
    path: upload.public_id,
    url: upload.secure_url,
    alt: `${item.name} — ${item.color} ${item.categoryId === "demo-accessories" ? "accessory" : "Pakistani ensemble"}`,
    width: upload.width,
    height: upload.height,
    contentType: "image/png",
    contentHash: item.hash,
    sortOrder: 0,
  };
  console.log(`Uploaded ${item.name}`);
}
const timestamp = () => ({
  schemaVersion: 1,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
});
function validated(schema, document) {
  const sample = { ...document, createdAt: new Date(), updatedAt: new Date() };
  if (document.publishedAt) sample.publishedAt = new Date();
  schema.parse(sample);
  return document;
}
await database.runTransaction(async (tx) => {
  if ((await tx.get(seedRef)).exists) return;
  // These updates only change merchandising flags, never existing stock or orders.
  for (const id of originalIds)
    tx.update(database.collection("products").doc(id), {
      flags: { featured: true, newArrival: false },
      updatedAt: FieldValue.serverTimestamp(),
    });
  const categoryImages = {
    "demo-formal-wear": "sage-inaya-suit",
    "demo-mens-wear": "sand-raahil-kurta",
    "demo-accessories": "champagne-zari-potli",
  };
  for (const [id, slug] of Object.entries(categoryImages))
    tx.update(database.collection("categories").doc(id), {
      image: definitions.find((item) => item.slug === slug).media,
      updatedAt: FieldValue.serverTimestamp(),
    });
  for (const item of definitions) {
    const ref = database.collection("products").doc(item.id);
    tx.create(
      ref,
      validated(productDocumentSchema, {
        name: item.name,
        slug: item.slug,
        description: item.description,
        categoryId: item.categoryId,
        categoryPath: [item.categoryId],
        brand: "Bazm",
        basePrice: { amountMinor: item.price, currency: "PKR" },
        media: [item.media],
        tags: item.tags,
        searchTokens: [
          ...new Set(
            [item.name, "Bazm", ...item.tags]
              .join(" ")
              .toLowerCase()
              .match(/[a-z0-9]+/g),
          ),
        ],
        ratingSummary: { average: 0, count: 0 },
        flags: { featured: false, newArrival: true },
        seo: {
          title: `${item.name} | Bazm`,
          description: `${item.description.split(". ")[0]}.`.slice(0, 160),
        },
        status: "PUBLISHED",
        publishedAt: FieldValue.serverTimestamp(),
        archivedAt: null,
        ...timestamp(),
      }),
    );
    tx.create(database.collection("slugRegistry").doc(`product_${item.slug}`), {
      type: "PRODUCT",
      ownerId: item.id,
      slug: item.slug,
      createdAt: FieldValue.serverTimestamp(),
    });
    for (const size of item.sizes) {
      const code = size === "One Size" ? "OS" : size[0].toUpperCase();
      const variantId = `${item.id}-${code.toLowerCase()}`;
      const sku = `BZ-${item.code}-${code}`;
      tx.create(
        ref.collection("variants").doc(variantId),
        validated(productVariantDocumentSchema, {
          productId: item.id,
          sku,
          color: item.color,
          size,
          priceOverride: null,
          media: [],
          isActive: true,
          ...timestamp(),
        }),
      );
      tx.create(database.collection("skuRegistry").doc(sku), {
        productId: item.id,
        variantId,
        sku,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.create(
        database.collection("inventory").doc(sku),
        validated(inventoryDocumentSchema, {
          sku,
          productId: item.id,
          variantId,
          available: 12,
          reserved: 0,
          sold: 0,
          returned: 0,
          damaged: 0,
          reorderPoint: 3,
          reservedUntil: null,
          ...timestamp(),
        }),
      );
    }
  }
  tx.create(seedRef, {
    version: 3,
    productIds: definitions.map((item) => item.id),
    cloudinaryPublicIds: definitions.map((item) => item.media.path),
    previousMerchandising: prerequisites.map((doc) => ({
      path: doc.ref.path,
      flags: doc.get("flags") ?? null,
      image: doc.get("image") ?? null,
    })),
    createdAt: FieldValue.serverTimestamp(),
  });
});
console.log(
  "Published 8 new demo products with 20 purchasable size variants; curated 3 collection photos and 4 featured products.",
);
