import "server-only";

import { orderDocumentSchema, reviewDocumentSchema } from "@bazm/domain";
import { cache } from "react";

import { getServerFirestore } from "@/lib/firebase/admin";

function iso(value: Date | { toDate: () => Date }) {
  return (value instanceof Date ? value : value.toDate()).toISOString();
}

function reviewLineKey(orderId: string, productId: string, variantId: string) {
  return `${orderId}:${productId}:${variantId}`;
}

function editWindowEnd(value: Date | { toDate: () => Date }) {
  return new Date(
    (value instanceof Date ? value : value.toDate()).getTime() +
      30 * 86_400_000,
  );
}

export type CustomerReviewItem = {
  orderId: string;
  productId: string;
  variantId: string;
  productName: string;
  sku: string;
  color: string;
  size: string;
  quantity: number;
  placedAt: string;
  existingReview: {
    id: string;
    status: string;
    rating: number;
    title: string | null;
    content: string;
    images: ReturnType<typeof reviewDocumentSchema.parse>["images"];
    createdAt: string;
    editableUntil: string;
    canEdit: boolean;
  } | null;
};

export const listCustomerReviewItems = cache(async (userId: string) => {
  const database = getServerFirestore();
  const [ordersSnapshot, reviewsSnapshot] = await Promise.all([
    database
      .collection("orders")
      .where("userId", "==", userId)
      .orderBy("placedAt", "desc")
      .limit(25)
      .get(),
    database
      .collection("reviews")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get(),
  ]);

  const reviewsByLine = new Map<string, CustomerReviewItem["existingReview"]>();
  for (const document of reviewsSnapshot.docs) {
    const parsed = reviewDocumentSchema.safeParse(document.data());
    if (!parsed.success) continue;
    const review = parsed.data;
    const editableUntil =
      review.editableUntil ?? editWindowEnd(review.createdAt);
    reviewsByLine.set(
      reviewLineKey(review.orderId, review.productId, review.variantId),
      {
        id: document.id,
        status: review.status,
        rating: review.rating,
        title: review.title,
        content: review.content,
        images: review.images,
        createdAt: iso(review.createdAt),
        editableUntil: iso(editableUntil),
        canEdit:
          review.status !== "HIDDEN" &&
          review.archivedAt === null &&
          Date.now() <=
            (editableUntil instanceof Date
              ? editableUntil
              : editableUntil.toDate()
            ).getTime(),
      },
    );
  }

  return ordersSnapshot.docs.flatMap((document) => {
    const order = orderDocumentSchema.parse(document.data());
    if (order.status !== "DELIVERED") return [];
    return order.items.map((item) => ({
      orderId: document.id,
      productId: item.productId,
      variantId: item.variantId,
      productName: item.productName,
      sku: item.sku,
      color: item.color,
      size: item.size,
      quantity: item.quantity,
      placedAt: iso(order.placedAt),
      existingReview:
        reviewsByLine.get(
          reviewLineKey(document.id, item.productId, item.variantId),
        ) ?? null,
    }));
  });
});
