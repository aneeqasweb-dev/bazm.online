import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { v2 as cloudinary } from "cloudinary";

const envPath = new URL("../frontend/.env.local", import.meta.url);
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && process.env[match[1]] === undefined) {
    process.env[match[1]] = match[2];
  }
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

const projectId = required("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
if (projectId !== "bazmonline-staging-aneeqa") {
  throw new Error(
    `Refusing to seed ${projectId}; this command is staging-only.`,
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

const database = getFirestore(
  initializeApp(
    { credential: applicationDefault(), projectId },
    "portfolio-catalog-v2",
  ),
);
const seedRef = database.collection("systemSeeds").doc("portfolio-catalog-v2");
if ((await seedRef.get()).exists) {
  console.log("Portfolio catalog v2 is already seeded; no changes made.");
  process.exit(0);
}

const definitions = [
  {
    id: "demo-ruby-meher-ensemble",
    slug: "ruby-meher-ensemble",
    name: "Ruby Meher Ensemble",
    image: "ruby-meher-ensemble.png",
    alt: "Ruby Meher embroidered three-piece formal ensemble",
    publicId: "bazm/demo/ruby-meher-ensemble",
    categoryId: "demo-formal-wear",
    price: 1890000,
    sku: "BZ-MEHER-RBY-M",
    color: "Ruby",
    size: "Medium",
    stock: 9,
    description:
      "A graceful ruby three-piece ensemble with champagne-gold embroidery and a flowing chiffon dupatta, created for weddings and festive evenings.",
    tags: ["formal", "three-piece", "ruby", "embroidered"],
    rating: { average: 4.7, count: 9 },
  },
  {
    id: "demo-ivory-zayn-waistcoat",
    slug: "ivory-zayn-waistcoat",
    name: "Ivory Zayn Waistcoat",
    image: "ivory-zayn-waistcoat.png",
    alt: "Ivory Zayn jacquard waistcoat over a white kurta",
    publicId: "bazm/demo/ivory-zayn-waistcoat",
    categoryId: "demo-mens-wear",
    price: 895000,
    sku: "BZ-ZAYN-IVR-L",
    color: "Ivory",
    size: "Large",
    stock: 12,
    description:
      "A tailored ivory jacquard waistcoat with antique-brass buttons, balancing traditional occasion wear with a clean contemporary finish.",
    tags: ["menswear", "waistcoat", "ivory", "jacquard"],
    rating: { average: 4.6, count: 7 },
  },
  {
    id: "demo-midnight-mehr-clutch",
    slug: "midnight-mehr-clutch",
    name: "Midnight Mehr Clutch",
    image: "midnight-mehr-clutch.png",
    alt: "Midnight navy velvet Mehr clutch with gold embroidery",
    publicId: "bazm/demo/midnight-mehr-clutch",
    categoryId: "demo-accessories",
    price: 495000,
    sku: "BZ-MEHR-NVY-OS",
    color: "Midnight Navy",
    size: "One Size",
    stock: 18,
    description:
      "A structured midnight-navy velvet clutch detailed with fine antique-gold embroidery and a polished clasp for elegant evening styling.",
    tags: ["accessories", "clutch", "navy", "velvet"],
    rating: { average: 4.9, count: 14 },
  },
];

const assetsDirectory = fileURLToPath(new URL("./assets/", import.meta.url));
for (const item of definitions) {
  const localPath = `${assetsDirectory}${item.image}`;
  const bytes = readFileSync(localPath);
  const uploaded = await cloudinary.uploader.upload(localPath, {
    public_id: item.publicId,
    overwrite: false,
    resource_type: "image",
    tags: ["bazm", "portfolio-demo", "seed-v2"],
  });
  item.media = {
    path: uploaded.public_id,
    url: uploaded.secure_url,
    alt: item.alt,
    width: uploaded.width,
    height: uploaded.height,
    contentType: `image/${uploaded.format === "jpg" ? "jpeg" : uploaded.format}`,
    contentHash: createHash("sha256").update(bytes).digest("hex"),
    sortOrder: 0,
  };
}

const categories = [
  {
    id: "demo-mens-wear",
    name: "Men's Wear",
    slug: "mens-wear",
    sortOrder: 20,
    media: definitions[1].media,
    description:
      "Discover refined Pakistani menswear and tailored layers for celebrations and formal occasions.",
  },
  {
    id: "demo-accessories",
    name: "Accessories",
    slug: "accessories",
    sortOrder: 30,
    media: definitions[2].media,
    description:
      "Complete every occasion look with carefully selected bags and finishing accessories from Bazm.",
  },
];

await database.runTransaction(async (transaction) => {
  if ((await transaction.get(seedRef)).exists) return;

  for (const category of categories) {
    transaction.create(database.collection("categories").doc(category.id), {
      name: category.name,
      slug: category.slug,
      parentId: null,
      depth: 0,
      sortOrder: category.sortOrder,
      image: category.media,
      seo: {
        title: `${category.name} Collection | Bazm`,
        description: category.description,
      },
      status: "ACTIVE",
      archivedAt: null,
      schemaVersion: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(
      database.collection("slugRegistry").doc(`category_${category.slug}`),
      {
        type: "CATEGORY",
        ownerId: category.id,
        slug: category.slug,
        createdAt: FieldValue.serverTimestamp(),
      },
    );
  }

  for (const [index, item] of definitions.entries()) {
    const productRef = database.collection("products").doc(item.id);
    const variantId = `${item.id}-variant`;
    transaction.create(productRef, {
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
      ratingSummary: item.rating,
      flags: { featured: index !== 1, newArrival: index !== 0 },
      seo: {
        title: `${item.name} | Bazm`,
        description: item.description,
      },
      status: "PUBLISHED",
      publishedAt: FieldValue.serverTimestamp(),
      archivedAt: null,
      schemaVersion: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(
      database.collection("slugRegistry").doc(`product_${item.slug}`),
      {
        type: "PRODUCT",
        ownerId: item.id,
        slug: item.slug,
        createdAt: FieldValue.serverTimestamp(),
      },
    );
    transaction.create(productRef.collection("variants").doc(variantId), {
      productId: item.id,
      sku: item.sku,
      color: item.color,
      size: item.size,
      priceOverride: null,
      media: [],
      isActive: true,
      schemaVersion: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(database.collection("skuRegistry").doc(item.sku), {
      productId: item.id,
      variantId,
      sku: item.sku,
      createdAt: FieldValue.serverTimestamp(),
    });
    transaction.create(database.collection("inventory").doc(item.sku), {
      sku: item.sku,
      productId: item.id,
      variantId,
      available: item.stock,
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
  }
  transaction.create(seedRef, {
    version: 2,
    categoryIds: categories.map((category) => category.id),
    productIds: definitions.map((item) => item.id),
    cloudinaryPublicIds: definitions.map((item) => item.publicId),
    createdAt: FieldValue.serverTimestamp(),
  });
});

console.log("Seeded 2 categories and 3 additional published products.");
