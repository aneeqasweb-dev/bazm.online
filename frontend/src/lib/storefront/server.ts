import "server-only";

import {
  documentIdSchema,
  productDocumentSchema,
  productVariantDocumentSchema,
  publicProductReadSchema,
  publicReviewReadSchema,
  reviewDocumentSchema,
} from "@bazm/domain";
import { cache } from "react";

import { getServerFirestore } from "@/lib/firebase/admin";
import type { ReviewSort, ReviewSummary } from "@/lib/reviews/presentation";

const REVIEW_PAGE_SIZE = 5;

function iso(value: Date | { toDate: () => Date }) {
  return (value instanceof Date ? value : value.toDate()).toISOString();
}

export const getPublishedProductBySlug = cache(async (slug: string) => {
  const database = getServerFirestore();
  const registry = await database
    .collection("slugRegistry")
    .doc(`product_${slug}`)
    .get();
  const id = registry.get("ownerId");
  if (typeof id !== "string") return null;
  const document = await database.collection("products").doc(id).get();
  if (!document.exists) return null;
  const product = productDocumentSchema.parse(document.data());
  if (product.status !== "PUBLISHED") return null;
  const variants = await document.ref.collection("variants").limit(50).get();
  return {
    product: publicProductReadSchema.parse({
      id: document.id,
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
    }),
    variants: variants.docs.map((document) => {
      const variant = productVariantDocumentSchema.parse(document.data());
      return {
        id: document.id,
        productId: variant.productId,
        sku: variant.sku,
        color: variant.color,
        size: variant.size,
        priceOverride: variant.priceOverride,
        media: variant.media,
        isActive: variant.isActive,
      };
    }),
  };
});

export type PublicProductReview = Omit<
  ReturnType<typeof publicReviewReadSchema.parse>,
  "createdAt"
> & {
  createdAt: string;
};

export const listPublishedProductReviews = cache(
  async ({
    productId,
    after,
    sort = "recent",
  }: {
    productId: string;
    after?: string | null;
    sort?: ReviewSort;
  }) => {
    const database = getServerFirestore();
    const published = database
      .collection("reviews")
      .where("productId", "==", productId)
      .where("status", "==", "PUBLISHED");
    let query = (
      sort === "recent"
        ? published
        : published.orderBy("rating", sort === "highest" ? "desc" : "asc")
    )
      .orderBy("createdAt", "desc")
      .limit(REVIEW_PAGE_SIZE + 1);

    if (after && documentIdSchema.safeParse(after).success) {
      const cursor = await database.collection("reviews").doc(after).get();
      if (
        cursor.exists &&
        cursor.get("productId") === productId &&
        cursor.get("status") === "PUBLISHED"
      ) {
        query = query.startAfter(cursor);
      }
    }

    const snapshot = await query.get();
    const documents = snapshot.docs.slice(0, REVIEW_PAGE_SIZE);
    const items = documents.map((document) => {
      const review = reviewDocumentSchema.parse(document.data());
      const publicReview = publicReviewReadSchema.parse({
        id: document.id,
        rating: review.rating,
        title: review.title,
        content: review.content,
        authorName: review.authorName,
        verifiedPurchase: review.verifiedPurchase,
        images: review.images,
        createdAt: review.createdAt,
      });
      return {
        ...publicReview,
        createdAt: iso(publicReview.createdAt),
      };
    });

    return {
      items,
      nextCursor:
        snapshot.docs.length > REVIEW_PAGE_SIZE
          ? (documents.at(-1)?.id ?? null)
          : null,
    };
  },
);

export const getPublishedProductReviewSummary = cache(
  async (productId: string): Promise<ReviewSummary> => {
    const query = getServerFirestore()
      .collection("reviews")
      .where("productId", "==", productId)
      .where("status", "==", "PUBLISHED");
    const distribution = await Promise.all(
      [5, 4, 3, 2, 1].map(async (rating) => {
        const snapshot = await query
          .where("rating", "==", rating)
          .count()
          .get();
        return { rating, count: snapshot.data().count };
      }),
    );
    const count = distribution.reduce((total, row) => total + row.count, 0);
    const average = count
      ? distribution.reduce((total, row) => total + row.rating * row.count, 0) /
        count
      : 0;
    return { count, average, distribution };
  },
);
