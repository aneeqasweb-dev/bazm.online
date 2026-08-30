import {
  adminPermissionSchema,
  couponDocumentSchema,
  couponStatusSchema,
  createCouponInputSchema,
  documentIdSchema,
  DomainError,
  orderDocumentSchema,
  paymentDocumentSchema,
  positiveMoneySchema,
  returnConditionSchema,
  reviewDocumentSchema,
  reviewStatusSchema,
  returnDocumentSchema,
  returnStatusSchema,
  settingsDocumentSchema,
  settingsVisibilitySchema,
  updateCouponInputSchema,
  userDocumentSchema,
  userRoleSchema,
  type AdminPermission,
  type CouponDocument,
  type ReviewDocument,
  type SettingsDocument,
  type UserRole,
} from "@bazm/domain";
import { createHash, randomUUID } from "node:crypto";
import type { Auth } from "firebase-admin/auth";
import {
  FieldValue,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { z } from "zod";

import { InventoryService } from "../inventory/inventory-service.js";
import { PaymentService } from "../payments/payment-service.js";

const settingsKeySchema = z
  .string()
  .trim()
  .min(3)
  .max(100)
  .regex(/^[a-z]+(?:\.[a-z0-9]+)*$/);

export const updateUserAccessCommandSchema = z
  .object({
    userId: documentIdSchema,
    role: userRoleSchema,
    isActive: z.boolean(),
    permissions: z.array(adminPermissionSchema).max(50).default([]),
  })
  .strict();

export const createCouponCommandSchema = createCouponInputSchema;

export const updateCouponCommandSchema = z
  .object({
    id: documentIdSchema,
    input: updateCouponInputSchema,
  })
  .strict();

export const couponStatusCommandSchema = z
  .object({
    id: documentIdSchema,
    status: couponStatusSchema,
  })
  .strict();

export const moderateReviewCommandSchema = z
  .object({
    reviewId: documentIdSchema,
    status: reviewStatusSchema,
    moderationReason: z
      .string()
      .trim()
      .min(3)
      .max(500)
      .nullable()
      .default(null),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      ["REJECTED", "HIDDEN"].includes(value.status) &&
      !value.moderationReason
    ) {
      context.addIssue({
        code: "custom",
        path: ["moderationReason"],
        message: "A moderation reason is required.",
      });
    }
  });

export const updateReturnStatusCommandSchema = z
  .object({
    returnId: documentIdSchema,
    status: returnStatusSchema,
    staffNote: z.string().trim().min(3).max(1_000).nullable().default(null),
    refundPaymentId: documentIdSchema.nullable().default(null),
    refundAmount: positiveMoneySchema.nullable().default(null),
    refundIdempotencyKey: z
      .string()
      .trim()
      .min(8)
      .max(80)
      .regex(/^[A-Za-z0-9_-]+$/, "Use a safe refund key.")
      .nullable()
      .default(null),
    refundReason: z.string().trim().min(3).max(500).nullable().default(null),
    condition: returnConditionSchema
      .extract(["RESELLABLE", "DAMAGED"])
      .nullable()
      .default(null),
  })
  .strict();

export const upsertSettingsCommandSchema = z
  .object({
    key: settingsKeySchema,
    visibility: settingsVisibilitySchema,
    value: z.record(z.string().trim().min(1).max(80), z.unknown()),
    expectedRevision: z
      .number()
      .int()
      .min(1)
      .max(999_999)
      .nullable()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const encoded = JSON.stringify(value.value);
    if (!encoded || encoded.length > 12_000) {
      context.addIssue({
        code: "custom",
        path: ["value"],
        message: "Settings must be valid JSON below 12 KB.",
      });
    }
  });

type AuditMetadataValue = string | number | boolean | null | undefined;

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
    action:
      | "AUTH"
      | "CATALOG"
      | "INVENTORY"
      | "ORDER"
      | "PAYMENT"
      | "COUPON"
      | "RETURN"
      | "SETTINGS";
    actorId: string;
    targetType: string;
    targetId: string | null;
    metadata?: Record<string, AuditMetadataValue>;
  },
) {
  transaction.create(firestore.collection("auditLogs").doc(), {
    action: input.action,
    actorId: input.actorId,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: auditMetadata(input.metadata ?? {}),
    correlationId: `admin-${randomUUID()}`,
    schemaVersion: 1,
    createdAt: FieldValue.serverTimestamp(),
  });
}

function codeHash(code: string) {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

function couponCodeRegistryPath(hash: string) {
  return `couponCodeRegistry/${hash}`;
}

function timestampDate(value: Date | { toDate: () => Date }) {
  return value instanceof Date ? value : value.toDate();
}

function staffPermissions(role: UserRole, permissions: AdminPermission[]) {
  return role === "STAFF" ? [...new Set(permissions)] : [];
}

export type ReturnStatus = z.infer<typeof returnStatusSchema>;

const allowedReturnTransitions: Record<ReturnStatus, readonly ReturnStatus[]> =
  {
    REQUESTED: ["APPROVED", "REJECTED"],
    APPROVED: ["RECEIVED", "CLOSED"],
    REJECTED: ["CLOSED"],
    RECEIVED: ["REFUNDED", "CLOSED"],
    REFUNDED: ["CLOSED"],
    CLOSED: [],
  };

const orderOpenReturnStatuses = new Set<ReturnStatus>([
  "REQUESTED",
  "APPROVED",
  "RECEIVED",
]);

export function isAllowedReturnTransition(
  current: ReturnStatus,
  next: ReturnStatus,
) {
  if (current === next) return true;
  return allowedReturnTransitions[current].includes(next);
}

function assertReturnTransition(current: ReturnStatus, next: ReturnStatus) {
  if (!isAllowedReturnTransition(current, next)) {
    throw new DomainError(
      "PRECONDITION_FAILED",
      `Return status cannot move from ${current} to ${next}.`,
    );
  }
}

function normalizedRefundKey(returnId: string) {
  const safe = returnId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 65);
  return `return-${safe || "request"}`;
}

export class AdminOperationsService {
  private readonly inventory: InventoryService;
  private readonly payments: PaymentService;

  constructor(
    private readonly firestore: Firestore,
    private readonly auth: Auth,
  ) {
    this.inventory = new InventoryService(firestore);
    this.payments = new PaymentService(firestore);
  }

  async updateUserAccess(
    actorId: string,
    actorRole: UserRole,
    command: z.infer<typeof updateUserAccessCommandSchema>,
  ) {
    if (command.userId === actorId && command.isActive === false) {
      throw new DomainError(
        "PRECONDITION_FAILED",
        "You cannot disable your own admin account.",
      );
    }
    if (
      (command.role === "ADMIN" || command.role === "SUPER_ADMIN") &&
      actorRole !== "SUPER_ADMIN"
    ) {
      throw new DomainError(
        "FORBIDDEN",
        "Only a super admin can grant administrator roles.",
      );
    }

    const permissions = staffPermissions(command.role, command.permissions);

    await this.firestore.runTransaction(async (transaction) => {
      const reference = this.firestore.collection("users").doc(command.userId);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) {
        throw new DomainError("NOT_FOUND", "The user profile does not exist.");
      }
      const current = userDocumentSchema.parse(snapshot.data());
      if (
        (current.role === "ADMIN" || current.role === "SUPER_ADMIN") &&
        actorRole !== "SUPER_ADMIN"
      ) {
        throw new DomainError(
          "FORBIDDEN",
          "Only a super admin can modify administrator accounts.",
        );
      }
      transaction.update(reference, {
        role: command.role,
        isActive: command.isActive,
        permissions:
          command.role === "STAFF" ? permissions : FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      audit(this.firestore, transaction, {
        action: "AUTH",
        actorId,
        targetType: "user",
        targetId: command.userId,
        metadata: {
          previousRole: current.role,
          nextRole: command.role,
          isActive: command.isActive,
          permissions: permissions.join(","),
        },
      });
    });

    await this.auth.updateUser(command.userId, {
      disabled: command.isActive === false,
    });
    await this.auth.setCustomUserClaims(command.userId, {
      role: command.role,
      isActive: command.isActive,
      claimsVersion: 1,
      ...(permissions.length ? { permissions } : {}),
    });
    if (!command.isActive) await this.auth.revokeRefreshTokens(command.userId);

    return {
      userId: command.userId,
      role: command.role,
      isActive: command.isActive,
    };
  }

  async createCoupon(
    actorId: string,
    command: z.infer<typeof createCouponCommandSchema>,
  ) {
    const normalizedCode = command.code.trim().toUpperCase();
    const hash = codeHash(normalizedCode);
    const existing = await this.firestore
      .collection("coupons")
      .where("codeHash", "==", hash)
      .limit(1)
      .get();
    if (!existing.empty) {
      throw new DomainError(
        "CONFLICT",
        "A coupon with this code already exists.",
      );
    }

    return this.firestore.runTransaction(async (transaction) => {
      const registry = this.firestore.doc(couponCodeRegistryPath(hash));
      const registrySnapshot = await transaction.get(registry);
      if (registrySnapshot.exists) {
        throw new DomainError(
          "CONFLICT",
          "A coupon with this code already exists.",
        );
      }
      const reference = this.firestore.collection("coupons").doc();
      transaction.create(reference, {
        codeHash: hash,
        displayCode: normalizedCode,
        discount: command.discount,
        minimumOrderAmount: command.minimumOrderAmount,
        maximumDiscountAmount: command.maximumDiscountAmount,
        startsAt: command.startsAt,
        endsAt: command.endsAt,
        usageLimit: command.usageLimit,
        perCustomerLimit: command.perCustomerLimit,
        redemptionCount: 0,
        status: "DRAFT",
        archivedAt: null,
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      } satisfies Omit<CouponDocument, "createdAt" | "updatedAt"> & {
        createdAt: FieldValue;
        updatedAt: FieldValue;
      });
      transaction.create(registry, {
        couponId: reference.id,
        displayCode: normalizedCode,
        createdAt: FieldValue.serverTimestamp(),
      });
      audit(this.firestore, transaction, {
        action: "COUPON",
        actorId,
        targetType: "coupon",
        targetId: reference.id,
        metadata: { event: "create", code: normalizedCode },
      });
      return { id: reference.id, status: "DRAFT" as const };
    });
  }

  async updateCoupon(
    actorId: string,
    command: z.infer<typeof updateCouponCommandSchema>,
  ) {
    return this.firestore.runTransaction(async (transaction) => {
      const reference = this.firestore.collection("coupons").doc(command.id);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) {
        throw new DomainError("NOT_FOUND", "The coupon does not exist.");
      }
      const current = couponDocumentSchema.parse(snapshot.data());
      const patch: Record<string, unknown> = {
        ...command.input,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (command.input.code) {
        const normalizedCode = command.input.code.trim().toUpperCase();
        const nextHash = codeHash(normalizedCode);
        if (nextHash !== current.codeHash) {
          const registry = this.firestore.doc(couponCodeRegistryPath(nextHash));
          const registrySnapshot = await transaction.get(registry);
          if (registrySnapshot.exists) {
            throw new DomainError(
              "CONFLICT",
              "A coupon with this code already exists.",
            );
          }
          transaction.delete(
            this.firestore.doc(couponCodeRegistryPath(current.codeHash)),
          );
          transaction.create(registry, {
            couponId: command.id,
            displayCode: normalizedCode,
            createdAt: FieldValue.serverTimestamp(),
          });
          patch.codeHash = nextHash;
          patch.displayCode = normalizedCode;
        }
        delete patch.code;
      }
      transaction.update(reference, patch);
      audit(this.firestore, transaction, {
        action: "COUPON",
        actorId,
        targetType: "coupon",
        targetId: command.id,
        metadata: {
          event: "update",
          code: String(patch.displayCode ?? current.displayCode),
        },
      });
      return { id: command.id, status: current.status };
    });
  }

  async setCouponStatus(
    actorId: string,
    command: z.infer<typeof couponStatusCommandSchema>,
  ) {
    return this.firestore.runTransaction(async (transaction) => {
      const reference = this.firestore.collection("coupons").doc(command.id);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) {
        throw new DomainError("NOT_FOUND", "The coupon does not exist.");
      }
      const current = couponDocumentSchema.parse(snapshot.data());
      if (
        command.status === "ACTIVE" &&
        timestampDate(current.endsAt).getTime() <= Date.now()
      ) {
        throw new DomainError(
          "PRECONDITION_FAILED",
          "Expired coupons cannot be activated.",
        );
      }
      transaction.update(reference, {
        status: command.status,
        archivedAt:
          command.status === "ARCHIVED" ? FieldValue.serverTimestamp() : null,
        updatedAt: FieldValue.serverTimestamp(),
      });
      audit(this.firestore, transaction, {
        action: "COUPON",
        actorId,
        targetType: "coupon",
        targetId: command.id,
        metadata: {
          event: "status",
          previousStatus: current.status,
          nextStatus: command.status,
        },
      });
      return { id: command.id, status: command.status };
    });
  }

  async moderateReview(
    actorId: string,
    command: z.infer<typeof moderateReviewCommandSchema>,
  ) {
    const productId = await this.firestore.runTransaction(
      async (transaction) => {
        const reference = this.firestore
          .collection("reviews")
          .doc(command.reviewId);
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) {
          throw new DomainError("NOT_FOUND", "The review does not exist.");
        }
        const current = reviewDocumentSchema.parse(snapshot.data());
        transaction.update(reference, {
          status: command.status,
          moderationReason: command.moderationReason,
          archivedAt:
            command.status === "HIDDEN" ? FieldValue.serverTimestamp() : null,
          updatedAt: FieldValue.serverTimestamp(),
        });
        audit(this.firestore, transaction, {
          action: "CATALOG",
          actorId,
          targetType: "review",
          targetId: command.reviewId,
          metadata: {
            event: "moderate-review",
            previousStatus: current.status,
            nextStatus: command.status,
          },
        });
        return current.productId;
      },
    );
    await this.recalculateProductRating(productId);
    return { reviewId: command.reviewId, status: command.status };
  }

  async updateReturnStatus(
    actorId: string,
    command: z.infer<typeof updateReturnStatusCommandSchema>,
  ) {
    if (command.status === "REFUNDED") {
      return this.initiateReturnRefund(actorId, command);
    }

    return this.firestore.runTransaction(async (transaction) => {
      const reference = this.firestore
        .collection("returns")
        .doc(command.returnId);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) {
        throw new DomainError(
          "NOT_FOUND",
          "The return request does not exist.",
        );
      }
      const current = returnDocumentSchema.parse(snapshot.data());
      assertReturnTransition(current.status, command.status);
      if (current.status === command.status) {
        transaction.update(reference, {
          staffNote: command.staffNote ?? current.staffNote,
          refundPaymentId: command.refundPaymentId ?? current.refundPaymentId,
          updatedAt: FieldValue.serverTimestamp(),
        });
        return {
          returnId: command.returnId,
          status: current.status,
          idempotent: true,
        };
      }

      const siblingReturns =
        command.status === "REJECTED" || command.status === "CLOSED"
          ? await transaction.get(
              this.firestore
                .collection("returns")
                .where("orderId", "==", current.orderId),
            )
          : null;
      const hasOtherOpenReturn =
        siblingReturns?.docs.some((document) => {
          if (document.id === command.returnId) return false;
          const status = document.get("status");
          return (
            typeof status === "string" &&
            orderOpenReturnStatuses.has(status as ReturnStatus)
          );
        }) ?? false;

      if (command.status === "RECEIVED") {
        if (!command.condition) {
          throw new DomainError(
            "INVALID_ARGUMENT",
            "Choose whether the received return is resellable or damaged.",
          );
        }
        await this.inventory.receiveReturnInTransaction(transaction, {
          returnId: command.returnId,
          orderId: current.orderId,
          actorId,
          condition: command.condition,
          items: current.items,
          restoreResellableStock: current.restoreResellableStock,
        });
      }

      const orderStatus =
        command.status === "RECEIVED"
          ? "RETURNED"
          : command.status === "APPROVED"
            ? "RETURN_REQUESTED"
            : command.status === "REJECTED" && !hasOtherOpenReturn
              ? "DELIVERED"
              : null;
      transaction.update(reference, {
        status: command.status,
        staffNote: command.staffNote ?? current.staffNote,
        refundPaymentId: command.refundPaymentId ?? current.refundPaymentId,
        condition:
          command.status === "RECEIVED" ? command.condition : current.condition,
        approvedAt:
          command.status === "APPROVED"
            ? (current.approvedAt ?? FieldValue.serverTimestamp())
            : current.approvedAt,
        rejectedAt:
          command.status === "REJECTED"
            ? (current.rejectedAt ?? FieldValue.serverTimestamp())
            : current.rejectedAt,
        receivedAt:
          command.status === "RECEIVED"
            ? (current.receivedAt ?? FieldValue.serverTimestamp())
            : current.receivedAt,
        archivedAt:
          command.status === "CLOSED"
            ? FieldValue.serverTimestamp()
            : current.archivedAt,
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (orderStatus) {
        transaction.update(
          this.firestore.collection("orders").doc(current.orderId),
          {
            status: orderStatus,
            updatedAt: FieldValue.serverTimestamp(),
          },
        );
      }
      audit(this.firestore, transaction, {
        action: "RETURN",
        actorId,
        targetType: "return",
        targetId: command.returnId,
        metadata: {
          previousStatus: current.status,
          nextStatus: command.status,
          orderId: current.orderId,
        },
      });
      return { returnId: command.returnId, status: command.status };
    });
  }

  private async initiateReturnRefund(
    actorId: string,
    command: z.infer<typeof updateReturnStatusCommandSchema>,
  ) {
    const preparation = await this.firestore.runTransaction(
      async (transaction) => {
        const reference = this.firestore
          .collection("returns")
          .doc(command.returnId);
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) {
          throw new DomainError(
            "NOT_FOUND",
            "The return request does not exist.",
          );
        }
        const current = returnDocumentSchema.parse(snapshot.data());
        assertReturnTransition(current.status, command.status);
        if (current.status === "REFUNDED") {
          return {
            current,
            paymentId: current.refundPaymentId,
            amount: current.refundAmount,
            idempotencyKey: command.refundIdempotencyKey,
            reason: command.refundReason,
            alreadyRefunded: true,
          };
        }
        if (current.status !== "RECEIVED") {
          throw new DomainError(
            "PRECONDITION_FAILED",
            "Only received returns can be refunded.",
          );
        }
        const orderRef = this.firestore
          .collection("orders")
          .doc(current.orderId);
        const orderSnapshot = await transaction.get(orderRef);
        if (!orderSnapshot.exists) {
          throw new DomainError("NOT_FOUND", "The return order is missing.");
        }
        const order = orderDocumentSchema.parse(orderSnapshot.data());
        const paymentId = command.refundPaymentId ?? order.paymentId;
        if (!paymentId) {
          throw new DomainError(
            "PRECONDITION_FAILED",
            "This return has no payment available to refund.",
          );
        }
        const paymentRef = this.firestore.collection("payments").doc(paymentId);
        const paymentSnapshot = await transaction.get(paymentRef);
        if (!paymentSnapshot.exists) {
          throw new DomainError("NOT_FOUND", "The payment record is missing.");
        }
        const payment = paymentDocumentSchema.parse(paymentSnapshot.data());
        if (payment.orderId !== current.orderId) {
          throw new DomainError(
            "PRECONDITION_FAILED",
            "The refund payment does not belong to this return order.",
          );
        }
        if (!current.refundAmount || current.refundAmount.amountMinor <= 0) {
          throw new DomainError(
            "PRECONDITION_FAILED",
            "This return does not have a refundable amount.",
          );
        }
        const amount = command.refundAmount ?? current.refundAmount;
        if (
          amount.currency !== current.refundAmount.currency ||
          amount.amountMinor > current.refundAmount.amountMinor
        ) {
          throw new DomainError(
            "PRECONDITION_FAILED",
            "Refund amount exceeds this return's eligible amount.",
          );
        }
        return {
          current,
          paymentId,
          amount,
          idempotencyKey:
            command.refundIdempotencyKey ??
            normalizedRefundKey(command.returnId),
          reason:
            command.refundReason ??
            command.staffNote ??
            `Refund for return ${command.returnId}`,
          alreadyRefunded: false,
        };
      },
    );

    if (preparation.alreadyRefunded) {
      return {
        returnId: command.returnId,
        status: "REFUNDED" as const,
        refundId: preparation.current.refundId,
        refundStatus: "COMPLETED" as const,
        idempotent: true,
      };
    }
    if (!preparation.paymentId || !preparation.amount) {
      throw new DomainError(
        "PRECONDITION_FAILED",
        "This return is missing refund details.",
      );
    }

    const refund = await this.payments.initiateRefund(actorId, {
      paymentId: preparation.paymentId,
      returnId: command.returnId,
      idempotencyKey:
        preparation.idempotencyKey ?? normalizedRefundKey(command.returnId),
      amount: preparation.amount,
      reason: preparation.reason ?? `Refund for return ${command.returnId}`,
    });

    await this.firestore.runTransaction(async (transaction) => {
      const reference = this.firestore
        .collection("returns")
        .doc(command.returnId);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) return;
      const current = returnDocumentSchema.parse(snapshot.data());
      if (current.status !== "RECEIVED" && current.status !== "REFUNDED") {
        throw new DomainError(
          "PRECONDITION_FAILED",
          "The return changed before the refund could be linked.",
        );
      }
      transaction.update(reference, {
        refundId: refund.refundId,
        refundPaymentId: preparation.paymentId,
        staffNote: command.staffNote ?? current.staffNote,
        updatedAt: FieldValue.serverTimestamp(),
      });
      audit(this.firestore, transaction, {
        action: "RETURN",
        actorId,
        targetType: "return",
        targetId: command.returnId,
        metadata: {
          event: "refund-initiate",
          refundId: refund.refundId,
          refundStatus: String(refund.status),
          paymentId: preparation.paymentId,
          amount: preparation.amount?.amountMinor,
        },
      });
    });

    return {
      returnId: command.returnId,
      status: "RECEIVED" as const,
      refundId: refund.refundId,
      refundStatus: refund.status,
      idempotent: refund.idempotent,
    };
  }

  async upsertSettings(
    actorId: string,
    command: z.infer<typeof upsertSettingsCommandSchema>,
  ) {
    return this.firestore.runTransaction(async (transaction) => {
      const reference = this.firestore.collection("settings").doc(command.key);
      const snapshot = await transaction.get(reference);
      const current = snapshot.exists
        ? settingsDocumentSchema.parse(snapshot.data())
        : null;
      if (
        current &&
        command.expectedRevision &&
        command.expectedRevision !== current.revision
      ) {
        throw new DomainError(
          "CONFLICT",
          "The settings document changed. Refresh before saving.",
        );
      }
      const nextRevision = current ? current.revision + 1 : 1;
      const payload: Omit<SettingsDocument, "createdAt" | "updatedAt"> & {
        createdAt?: FieldValue;
        updatedAt: FieldValue;
      } = {
        key: command.key,
        visibility: command.visibility,
        value: command.value,
        revision: nextRevision,
        schemaVersion: current?.schemaVersion ?? 1,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (current) {
        transaction.update(reference, payload);
      } else {
        transaction.create(reference, {
          ...payload,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      audit(this.firestore, transaction, {
        action: "SETTINGS",
        actorId,
        targetType: "settings",
        targetId: command.key,
        metadata: {
          previousRevision: current?.revision,
          nextRevision,
          visibility: command.visibility,
          keys: Object.keys(command.value).sort().join(","),
        },
      });
      return { key: command.key, revision: nextRevision };
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
    ) as ReviewDocument[];
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
