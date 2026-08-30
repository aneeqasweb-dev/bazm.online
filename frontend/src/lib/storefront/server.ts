import "server-only";

import {
  productDocumentSchema,
  productVariantDocumentSchema,
  publicProductReadSchema,
  publicReviewReadSchema,
  reviewDocumentSchema,
} from "@bazm/domain";
import { cache } from "react";

import { getServerFirestore } from "@/lib/firebase/admin";

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
  }: {
    productId: string;
    after?: string | null;
  }) => {
    const database = getServerFirestore();
    let query = database
      .collection("reviews")
      .where("productId", "==", productId)
      .where("status", "==", "PUBLISHED")
      .orderBy("createdAt", "desc")
      .limit(REVIEW_PAGE_SIZE + 1);

    if (after) {
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
