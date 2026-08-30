import "server-only";

import {
  categoryDocumentSchema,
  decodeCursor,
  encodeCursor,
  pageRequestSchema,
  productDocumentSchema,
  publicProductReadSchema,
  type CategoryDocument,
  type PageRequest,
  type PageResult,
  type ProductDocument,
} from "@bazm/domain";
import { cache } from "react";

import { getServerFirestore } from "@/lib/firebase/admin";

export type CategorySummary = Pick<
  CategoryDocument,
  | "name"
  | "slug"
  | "parentId"
  | "depth"
  | "sortOrder"
  | "image"
  | "seo"
  | "status"
> & {
  id: string;
};

export type PublicCategoryPath = {
  category: CategorySummary;
  breadcrumbs: CategorySummary[];
};

export type PublicCategoryProduct = ReturnType<
  typeof publicProductReadSchema.parse
>;

function categorySummary(
  id: string,
  category: CategoryDocument,
): CategorySummary {
  return {
    id,
    name: category.name,
    slug: category.slug,
    parentId: category.parentId,
    depth: category.depth,
    sortOrder: category.sortOrder,
    image: category.image,
    seo: category.seo,
    status: category.status,
  };
}

function publicProduct(
  id: string,
  product: ProductDocument,
): PublicCategoryProduct {
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

async function categoryHasRegisteredRoute(id: string, slug: string) {
  const registry = await getServerFirestore()
    .collection("slugRegistry")
    .doc(`category_${slug}`)
    .get();
  return registry.get("ownerId") === id;
}

async function productHasRegisteredRoute(id: string, slug: string) {
  const registry = await getServerFirestore()
    .collection("slugRegistry")
    .doc(`product_${slug}`)
    .get();
  return registry.get("ownerId") === id;
}

export const listAdminCategories = cache(
  async (): Promise<CategorySummary[]> => {
    const snapshot = await getServerFirestore()
      .collection("categories")
      .orderBy("sortOrder")
      .limit(100)
      .get();

    return snapshot.docs
      .map((document) =>
        categorySummary(
          document.id,
          categoryDocumentSchema.parse(document.data()),
        ),
      )
      .sort(
        (left, right) =>
          left.depth - right.depth || left.sortOrder - right.sortOrder,
      );
  },
);

export const getActiveCategoryPath = cache(
  async (segments: string[]): Promise<PublicCategoryPath | null> => {
    if (segments.length === 0 || segments.length > 4) return null;

    const database = getServerFirestore();
    const breadcrumbs: CategorySummary[] = [];
    let parentId: string | null = null;

    for (const segment of segments) {
      const registry = await database
        .collection("slugRegistry")
        .doc(`category_${segment}`)
        .get();
      const categoryId = registry.get("ownerId");
      if (typeof categoryId !== "string") return null;

      const document = await database
        .collection("categories")
        .doc(categoryId)
        .get();
      if (!document.exists) return null;
      const category = categoryDocumentSchema.parse(document.data());
      if (
        category.status !== "ACTIVE" ||
        category.parentId !== parentId ||
        category.slug !== segment
      ) {
        return null;
      }
      breadcrumbs.push(categorySummary(document.id, category));
      parentId = document.id;
    }

    const category = breadcrumbs.at(-1);
    return category ? { category, breadcrumbs } : null;
  },
);

export const listActiveCategoryChildren = cache(
  async (parentId: string): Promise<CategorySummary[]> => {
    const snapshot = await getServerFirestore()
      .collection("categories")
      .where("status", "==", "ACTIVE")
      .where("parentId", "==", parentId)
      .orderBy("sortOrder")
      .limit(100)
      .get();
    const categories = snapshot.docs.map((document) =>
      categorySummary(
        document.id,
        categoryDocumentSchema.parse(document.data()),
      ),
    );
    const registered = await Promise.all(
      categories.map(async (category) =>
        (await categoryHasRegisteredRoute(category.id, category.slug))
          ? category
          : null,
      ),
    );
    return registered.filter(
      (category): category is CategorySummary => category !== null,
    );
  },
);

export const getActiveCategoryBreadcrumbsByIds = cache(
  async (categoryIds: string[]): Promise<CategorySummary[]> => {
    const boundedIds = categoryIds.slice(0, 4);
    const breadcrumbs: CategorySummary[] = [];
    let expectedParentId: string | null = null;

    for (const categoryId of boundedIds) {
      const document = await getServerFirestore()
        .collection("categories")
        .doc(categoryId)
        .get();
      if (!document.exists) return [];

      const category = categoryDocumentSchema.parse(document.data());
      if (
        category.status !== "ACTIVE" ||
        category.parentId !== expectedParentId
      ) {
        return [];
      }

      breadcrumbs.push(categorySummary(document.id, category));
      expectedParentId = document.id;
    }

    return breadcrumbs;
  },
);

export async function listPublishedProductsForCategory(
  categoryId: string,
  page: PageRequest,
): Promise<PageResult<PublicCategoryProduct>> {
  const request = pageRequestSchema.parse(page);
  const database = getServerFirestore();
  let query = database
    .collection("products")
    .where("status", "==", "PUBLISHED")
    .where("categoryId", "==", categoryId)
    .orderBy("basePrice.amountMinor", "asc")
    .limit(request.limit + 1);

  if (request.cursor) {
    const cursor = decodeCursor(request.cursor);
    if (!cursor) throw new Error("Invalid product page cursor.");
    const anchor = await database.collection("products").doc(cursor.id).get();
    const price = anchor.get("basePrice.amountMinor");
    if (
      !anchor.exists ||
      typeof price !== "number" ||
      String(price) !== cursor.value
    ) {
      throw new Error("Stale product page cursor.");
    }
    query = query.startAfter(anchor);
  }

  const snapshot = await query.get();
  const documents = [];
  for (const document of snapshot.docs) {
    const product = productDocumentSchema.parse(document.data());
    if (!(await productHasRegisteredRoute(document.id, product.slug))) continue;
    documents.push({ document, product });
    if (documents.length === request.limit) break;
  }
  const hasNextPage = snapshot.docs.length > request.limit;
  const lastDocument = documents.at(-1)?.document;

  return {
    items: documents.map(({ document, product }) =>
      publicProduct(document.id, product),
    ),
    nextCursor:
      hasNextPage && lastDocument
        ? encodeCursor({
            id: lastDocument.id,
            value: String(lastDocument.get("basePrice.amountMinor")),
          })
        : null,
  };
}
