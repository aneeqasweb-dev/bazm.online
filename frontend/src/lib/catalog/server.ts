import "server-only";

import {
  categoryDocumentSchema,
  decodeCursor,
  encodeCursor,
  productDocumentSchema,
  productVariantDocumentSchema,
  publicProductReadSchema,
} from "@bazm/domain";
import { createHash } from "node:crypto";

import { getServerFirestore } from "@/lib/firebase/admin";

const PAGE_SIZE = 24;
const MAX_CATALOG_SCAN = 96;

export type CatalogFilters = {
  query: string;
  categoryId: string | null;
  brand: string;
  color: string;
  size: string;
  availability: "ALL" | "AVAILABLE";
  rating: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  sort: "PRICE_ASC" | "PRICE_DESC" | "NEWEST";
};

export type CatalogProduct = ReturnType<
  typeof publicProductReadSchema.parse
> & {
  hasAvailableVariant: boolean;
  colors: string[];
  sizes: string[];
};

function normalized(value: string) {
  return value.trim().toLowerCase();
}

function cursorSignature(filters: CatalogFilters) {
  return createHash("sha256")
    .update(JSON.stringify(filters))
    .digest("hex")
    .slice(0, 16);
}

function sortConfiguration(sort: CatalogFilters["sort"]) {
  if (sort === "NEWEST")
    return { field: "createdAt", direction: "desc" as const };
  return {
    field: "basePrice.amountMinor",
    direction: sort === "PRICE_DESC" ? ("desc" as const) : ("asc" as const),
  };
}

function cursorValue(
  product: { get(path: string): unknown },
  sort: CatalogFilters["sort"],
) {
  const value = product.get(
    sort === "NEWEST" ? "createdAt" : "basePrice.amountMinor",
  );
  if (typeof value === "number") return String(value);
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate().toISOString();
  }
  return undefined;
}

function publicProduct(
  id: string,
  product: ReturnType<typeof productDocumentSchema.parse>,
) {
  return publicProductReadSchema.parse({
    id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    categoryId: product.categoryId,
    categoryPath: product.categoryPath,
    brand: product.brand,
    basePrice: product.basePrice,
    media: product.media,
    tags: product.tags,
    ratingSummary: product.ratingSummary,
    flags: product.flags,
    seo: product.seo,
  });
}

async function productHasRegisteredRoute(
  id: string,
  slug: string,
  database = getServerFirestore(),
) {
  const registry = await database
    .collection("slugRegistry")
    .doc(`product_${slug}`)
    .get();
  return registry.get("ownerId") === id;
}

function matchesFilters(
  product: ReturnType<typeof productDocumentSchema.parse>,
  variants: ReturnType<typeof productVariantDocumentSchema.parse>[],
  filters: CatalogFilters,
) {
  const activeVariants = variants.filter((variant) => variant.isActive);
  const colors = activeVariants.map((variant) => normalized(variant.color));
  const sizes = activeVariants.map((variant) => normalized(variant.size));
  const terms = normalized(filters.query).split(/\s+/).filter(Boolean);
  const queryMatches = terms.every((term) =>
    product.searchTokens.includes(term),
  );
  return (
    queryMatches &&
    (!filters.categoryId || product.categoryId === filters.categoryId) &&
    (!filters.brand ||
      normalized(product.brand) === normalized(filters.brand)) &&
    (!filters.color || colors.includes(normalized(filters.color))) &&
    (!filters.size || sizes.includes(normalized(filters.size))) &&
    (filters.availability === "ALL" || activeVariants.length > 0) &&
    (filters.rating === null ||
      product.ratingSummary.average >= filters.rating) &&
    (filters.minPrice === null ||
      product.basePrice.amountMinor >= filters.minPrice) &&
    (filters.maxPrice === null ||
      product.basePrice.amountMinor <= filters.maxPrice)
  );
}

export async function listShopProducts({
  cursor,
  filters,
}: {
  cursor: string | null;
  filters: CatalogFilters;
}) {
  const database = getServerFirestore();
  const sort = sortConfiguration(filters.sort);
  const signature = cursorSignature(filters);
  let query = database
    .collection("products")
    .where("status", "==", "PUBLISHED")
    .orderBy(sort.field, sort.direction)
    .limit(MAX_CATALOG_SCAN + 1);

  if (cursor) {
    const decoded = decodeCursor(cursor);
    const [value, savedSignature] = decoded?.value.split("|") ?? [];
    const anchor = decoded
      ? await database.collection("products").doc(decoded.id).get()
      : null;
    if (
      anchor?.exists &&
      savedSignature === signature &&
      cursorValue(anchor, filters.sort) === value
    ) {
      query = query.startAfter(anchor);
    }
  }

  const snapshot = await query.get();
  const scan = snapshot.docs.slice(0, MAX_CATALOG_SCAN);
  const candidates = await Promise.all(
    scan.map(async (document) => {
      const product = productDocumentSchema.parse(document.data());
      const [variants, registered] = await Promise.all([
        document.ref.collection("variants").limit(50).get(),
        productHasRegisteredRoute(document.id, product.slug, database),
      ]);
      return {
        document,
        product,
        registered,
        variants: variants.docs.map((variant) =>
          productVariantDocumentSchema.parse(variant.data()),
        ),
      };
    }),
  );

  const products: CatalogProduct[] = [];
  let lastScanned = null as (typeof snapshot.docs)[number] | null;
  for (const candidate of candidates) {
    lastScanned = candidate.document;
    if (!matchesFilters(candidate.product, candidate.variants, filters))
      continue;
    if (!candidate.registered) continue;
    const activeVariants = candidate.variants.filter(
      (variant) => variant.isActive,
    );
    products.push({
      ...publicProduct(candidate.document.id, candidate.product),
      hasAvailableVariant: activeVariants.length > 0,
      colors: [...new Set(activeVariants.map((variant) => variant.color))],
      sizes: [...new Set(activeVariants.map((variant) => variant.size))],
    });
    if (products.length === PAGE_SIZE) break;
  }

  const lastScannedIndex = lastScanned
    ? scan.findIndex((document) => document.id === lastScanned.id)
    : -1;
  const moreInSnapshot =
    lastScannedIndex >= 0 && snapshot.docs.length > lastScannedIndex + 1;
  const moreBeyondScan = snapshot.docs.length > scan.length;
  const nextCursor =
    lastScanned && (moreInSnapshot || moreBeyondScan)
      ? encodeCursor({
          id: lastScanned.id,
          value: `${cursorValue(lastScanned, filters.sort)}|${signature}`,
        })
      : null;

  return { products, nextCursor, scanned: scan.length };
}

export async function listHomeProducts({ kind }: { kind: "FEATURED" | "NEW" }) {
  const database = getServerFirestore();
  const snapshot = await database
    .collection("products")
    .where("status", "==", "PUBLISHED")
    .where(
      kind === "FEATURED" ? "flags.featured" : "flags.newArrival",
      "==",
      true,
    )
    .orderBy("createdAt", "desc")
    .limit(40)
    .get();
  const products = await Promise.all(
    snapshot.docs.map(async (document) => {
      const product = productDocumentSchema.parse(document.data());
      return (await productHasRegisteredRoute(
        document.id,
        product.slug,
        database,
      ))
        ? publicProduct(document.id, product)
        : null;
    }),
  );
  const visible = products.filter(
    (product): product is NonNullable<typeof product> => product !== null,
  );
  if (kind === "FEATURED") return visible.slice(0, 4);
  // Give each collection space in the new edit, even when a batch of products
  // was published together. Preserve recency within each collection.
  const groups = Map.groupBy(visible, (product) => product.categoryId);
  const mixed: typeof visible = [];
  while (
    mixed.length < 12 &&
    [...groups.values()].some((group) => group.length)
  ) {
    for (const group of groups.values()) {
      const product = group.shift();
      if (product) mixed.push(product);
      if (mixed.length === 12) break;
    }
  }
  return mixed;
}

export async function listRelatedProducts({
  categoryId,
  productId,
}: {
  categoryId: string;
  productId: string;
}) {
  const result = await listShopProducts({
    cursor: null,
    filters: {
      query: "",
      categoryId,
      brand: "",
      color: "",
      size: "",
      availability: "ALL",
      rating: null,
      minPrice: null,
      maxPrice: null,
      sort: "PRICE_ASC",
    },
  });
  return result.products
    .filter((product) => product.id !== productId)
    .slice(0, 4);
}

export async function listHomeCategories() {
  const snapshot = await getServerFirestore()
    .collection("categories")
    .where("status", "==", "ACTIVE")
    .where("parentId", "==", null)
    .orderBy("sortOrder", "asc")
    .limit(12)
    .get();
  const database = getServerFirestore();
  const categories = snapshot.docs.map((document) => ({
    id: document.id,
    ...categoryDocumentSchema.parse(document.data()),
  }));
  const registered = await Promise.all(
    categories.map(async (category) => {
      const registry = await database
        .collection("slugRegistry")
        .doc(`category_${category.slug}`)
        .get();
      return registry.get("ownerId") === category.id ? category : null;
    }),
  );
  return registered
    .filter(
      (category): category is NonNullable<typeof category> => category !== null,
    )
    .slice(0, 6);
}
