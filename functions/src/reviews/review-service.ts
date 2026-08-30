import {
  createReviewInputSchema,
  documentIdSchema,
  DomainError,
  orderDocumentSchema,
  productDocumentSchema,
  reviewDocumentSchema,
  updateReviewInputSchema,
  userDocumentSchema,
  type ReviewDocument,
} from "@bazm/domain";
import { createHash, randomUUID } from "node:crypto";
import {
  FieldValue,
  Timestamp,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { z } from "zod";

export const createReviewCommandSchema = createReviewInputSchema;
export const updateReviewCommandSchema = z
  .object({
    reviewId: documentIdSchema,
    input: updateReviewInputSchema.refine(
      (value) => Object.keys(value).length > 0,
      { message: "Provide at least one review field to update." },
    ),
  })
  .strict();
export const reportReviewCommandSchema = z
  .object({
    reviewId: documentIdSchema,
    reason: z
      .string()
      .trim()
      .min(3)
      .max(500)
      .default("Customer reported this review."),
  })
  .strict();

const REVIEW_EDIT_WINDOW_DAYS = 30;
const REVIEW_EDIT_WINDOW_MS = REVIEW_EDIT_WINDOW_DAYS * 86_400_000;

type AuditMetadataValue = string | number | boolean | null | undefined;

function digest(...parts: string[]) {
  return createHash("sha256").update(parts.join("\0")).digest("hex");
}

function reviewRegistryId(userId: string, orderId: string, variantId: string) {
  return digest(userId, orderId, variantId);
}

function orderItemKey(orderId: string, productId: string, variantId: string) {
  return digest(orderId, productId, variantId);
}

function asDate(value: Date | { toDate: () => Date }) {
  return value instanceof Date ? value : value.toDate();
}

function auditMetadata(input: Record<string, AuditMetadataValue>) {
  const output: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined) continue;
    output[key] = typeof value === "string" ? value.slice(0, 500) : value;
  }
  return output;
}

function audit(
  firestore: Firestore,
  transaction: Transaction,
  input: {
    actorId: string;
    targetType: string;
    targetId: string | null;
    metadata?: Record<string, AuditMetadataValue>;
  },
) {
  transaction.create(firestore.collection("auditLogs").doc(), {
    action: "CATALOG",
    actorId: input.actorId,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: auditMetadata(input.metadata ?? {}),
    correlationId: `review-${randomUUID()}`,
    schemaVersion: 1,
    createdAt: FieldValue.serverTimestamp(),
  });
}

function assertOwnedReviewImages(
  userId: string,
  images: z.infer<typeof createReviewInputSchema>["images"],
) {
  const prefix = `reviews/${userId}/`;
  for (const image of images) {
    if (
      !image.path.startsWith(prefix) ||
      image.path.includes("..") ||
      image.path.includes("//")
    ) {
      throw new DomainError(
        "INVALID_ARGUMENT",
        "Review images must be uploaded under your review image folder.",
      );
    }
  }
}

function editWindowEnd(review: ReviewDocument) {
  if (review.editableUntil) return asDate(review.editableUntil);
  return new Date(asDate(review.createdAt).getTime() + REVIEW_EDIT_WINDOW_MS);
}

export class ReviewService {
  constructor(private readonly firestore: Firestore) {}

  async create(
    userId: string,
    input: z.input<typeof createReviewCommandSchema>,
  ) {
    const command = createReviewCommandSchema.parse(input);
    assertOwnedReviewImages(userId, command.images);
    const registryId = reviewRegistryId(
      userId,
      command.orderId,
      command.variantId,
    );
    const lineKey = orderItemKey(
      command.orderId,
      command.productId,
      command.variantId,
    );
    const editableUntil = Timestamp.fromMillis(
      Date.now() + REVIEW_EDIT_WINDOW_MS,
    );

    return this.firestore.runTransaction(async (transaction) => {
      const orderRef = this.firestore.collection("orders").doc(command.orderId);
      const productRef = this.firestore
        .collection("products")
        .doc(command.productId);
      const userRef = this.firestore.collection("users").doc(userId);
      const registryRef = this.firestore
        .collection("reviewLineRegistry")
        .doc(registryId);
      const [orderSnapshot, productSnapshot, userSnapshot, registrySnapshot] =
        await Promise.all([
          transaction.get(orderRef),
          transaction.get(productRef),
          transaction.get(userRef),
          transaction.get(registryRef),
        ]);

      if (!orderSnapshot.exists) {
        throw new DomainError(
          "NOT_FOUND",
          "The delivered order item was not found.",
        );
      }
      const order = orderDocumentSchema.parse(orderSnapshot.data());
      if (order.userId !== userId) {
        throw new DomainError(
          "FORBIDDEN",
          "This order belongs to another customer.",
        );
      }
      if (order.status !== "DELIVERED") {
        throw new DomainError(
          "PRECONDITION_FAILED",
          "Reviews open after the item is delivered.",
        );
      }
      const orderItem = order.items.find(
        (item) =>
          item.productId === command.productId &&
          item.variantId === command.variantId,
      );
      if (!orderItem) {
        throw new DomainError(
          "NOT_FOUND",
          "The selected product was not found in this delivered order.",
        );
      }
      if (!productSnapshot.exists) {
        throw new DomainError("NOT_FOUND", "The product does not exist.");
      }
      productDocumentSchema.parse(productSnapshot.data());
      if (!userSnapshot.exists) {
        throw new DomainError(
          "PRECONDITION_FAILED",
          "The customer profile is missing.",
        );
      }
      const user = userDocumentSchema.parse(userSnapshot.data());
      if (registrySnapshot.exists) {
        throw new DomainError(
          "CONFLICT",
          "This delivered item already has a review.",
        );
      }
      const duplicate = await transaction.get(
        this.firestore
          .collection("reviews")
          .where("userId", "==", userId)
          .where("orderId", "==", command.orderId)
          .where("variantId", "==", command.variantId)
          .limit(1),
      );
      if (!duplicate.empty) {
        throw new DomainError(
          "CONFLICT",
          "This delivered item already has a review.",
        );
      }

      const reviewRef = this.firestore.collection("reviews").doc();
      transaction.create(reviewRef, {
        productId: command.productId,
        orderId: command.orderId,
        variantId: command.variantId,
        orderItemKey: lineKey,
        userId,
        authorName: user.name,
        rating: command.rating,
        title: command.title,
        content: command.content,
        images: command.images,
        status: "PENDING",
        verifiedPurchase: true,
        moderationReason: null,
        editableUntil,
        lastEditedAt: null,
        editCount: 0,
        reportedCount: 0,
        lastReportedAt: null,
        archivedAt: null,
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      } satisfies Omit<ReviewDocument, "createdAt" | "updatedAt"> & {
        createdAt: FieldValue;
        updatedAt: FieldValue;
      });
      transaction.create(registryRef, {
        reviewId: reviewRef.id,
        userId,
        orderId: command.orderId,
        productId: command.productId,
        variantId: command.variantId,
        orderItemKey: lineKey,
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
      });
      audit(this.firestore, transaction, {
        actorId: userId,
        targetType: "review",
        targetId: reviewRef.id,
        metadata: {
          event: "create-review",
          productId: command.productId,
          orderId: command.orderId,
          variantId: command.variantId,
        },
      });
      return { id: reviewRef.id, status: "PENDING" as const };
    });
  }

  async update(
    userId: string,
    reviewId: string,
    input: z.infer<typeof updateReviewCommandSchema>["input"],
  ) {
    const command = updateReviewInputSchema
      .refine((value) => Object.keys(value).length > 0, {
        message: "Provide at least one review field to update.",
      })
      .parse(input);
    if (command.images) assertOwnedReviewImages(userId, command.images);
    const result = await this.firestore.runTransaction(async (transaction) => {
      const reviewRef = this.firestore.collection("reviews").doc(reviewId);
      const snapshot = await transaction.get(reviewRef);
      if (!snapshot.exists) {
        throw new DomainError("NOT_FOUND", "The review does not exist.");
      }
      const current = reviewDocumentSchema.parse(snapshot.data());
      if (current.userId !== userId) {
        throw new DomainError(
          "FORBIDDEN",
          "Only the review owner can edit this review.",
        );
      }
      if (current.status === "HIDDEN" || current.archivedAt) {
        throw new DomainError(
          "PRECONDITION_FAILED",
          "Hidden reviews cannot be edited.",
        );
      }
      if (Date.now() > editWindowEnd(current).getTime()) {
        throw new DomainError(
          "PRECONDITION_FAILED",
          `Reviews can be edited for ${REVIEW_EDIT_WINDOW_DAYS} days after submission.`,
        );
      }

      const patch: Record<string, unknown> = {
        status: "PENDING",
        moderationReason: null,
        archivedAt: null,
        lastEditedAt: FieldValue.serverTimestamp(),
        editCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      };
      for (const field of ["rating", "title", "content", "images"] as const) {
        if (command[field] !== undefined) patch[field] = command[field];
      }
      transaction.update(reviewRef, patch);
      audit(this.firestore, transaction, {
        actorId: userId,
        targetType: "review",
        targetId: reviewId,
        metadata: {
          event: "edit-review",
          productId: current.productId,
          previousStatus: current.status,
          nextStatus: "PENDING",
        },
      });
      return { productId: current.productId, previousStatus: current.status };
    });

    if (result.previousStatus === "PUBLISHED") {
      await this.recalculateProductRating(result.productId);
    }
    return { reviewId, status: "PENDING" as const };
  }

  async report(
    userId: string,
    input: z.infer<typeof reportReviewCommandSchema>,
  ) {
    const reportId = digest("report", input.reviewId, userId);
    return this.firestore.runTransaction(async (transaction) => {
      const reviewRef = this.firestore
        .collection("reviews")
        .doc(input.reviewId);
      const reportRef = this.firestore
        .collection("reviewReports")
        .doc(reportId);
      const [reviewSnapshot, reportSnapshot] = await Promise.all([
        transaction.get(reviewRef),
        transaction.get(reportRef),
      ]);
      if (!reviewSnapshot.exists) {
        throw new DomainError("NOT_FOUND", "The review does not exist.");
      }
      const review = reviewDocumentSchema.parse(reviewSnapshot.data());
      if (review.status !== "PUBLISHED") {
        throw new DomainError(
          "PRECONDITION_FAILED",
          "Only published reviews can be reported.",
        );
      }
      if (review.userId === userId) {
        throw new DomainError(
          "PRECONDITION_FAILED",
          "You cannot report your own review.",
        );
      }
      if (reportSnapshot.exists) {
        throw new DomainError(
          "CONFLICT",
          "You have already reported this review.",
        );
      }
      transaction.create(reportRef, {
        reviewId: input.reviewId,
        productId: review.productId,
        reportedBy: userId,
        ownerId: review.userId,
        reason: input.reason,
        status: "OPEN",
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(reviewRef, {
        reportedCount: FieldValue.increment(1),
        lastReportedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      audit(this.firestore, transaction, {
        actorId: userId,
        targetType: "review",
        targetId: input.reviewId,
        metadata: {
          event: "report-review",
          productId: review.productId,
          reason: input.reason,
        },
      });
      return { reviewId: input.reviewId, reported: true as const };
    });
  }

  private async recalculateProductRating(productId: string) {
    const snapshot = await this.firestore
      .collection("reviews")
      .where("productId", "==", productId)
      .where("status", "==", "PUBLISHED")
      .limit(1_000)
      .get();
    const reviews = snapshot.docs.map((document) =>
      reviewDocumentSchema.parse(document.data()),
    );
    const count = reviews.length;
    const average =
      count === 0
        ? 0
        : Number(
            (
              reviews.reduce((total, review) => total + review.rating, 0) /
              count
            ).toFixed(2),
          );
    await this.firestore.collection("products").doc(productId).update({
      ratingSummary: { average, count },
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}
