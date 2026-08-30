import {
  createReturnInputSchema,
  DomainError,
  orderDocumentSchema,
  returnDocumentSchema,
  returnPolicySchema,
  settingsDocumentSchema,
  type OrderDocument,
  type ReturnDocument,
  type ReturnPolicy,
} from "@bazm/domain";
import { randomUUID } from "node:crypto";
import {
  FieldValue,
  Timestamp,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { z } from "zod";

export const createReturnCommandSchema = createReturnInputSchema;

type AuditMetadataValue = string | number | boolean | null | undefined;

const ACTIVE_RETURN_STATUSES = new Set([
  "REQUESTED",
  "APPROVED",
  "RECEIVED",
  "REFUNDED",
]);

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
    action: "RETURN",
    actorId: input.actorId,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: auditMetadata(input.metadata ?? {}),
    correlationId: `return-${randomUUID()}`,
    schemaVersion: 1,
    createdAt: FieldValue.serverTimestamp(),
  });
}

function assertOwnedEvidencePaths(userId: string, paths: string[]) {
  const prefix = `returns/${userId}/`;
  for (const path of paths) {
    if (
      !path.startsWith(prefix) ||
      path.includes("..") ||
      path.includes("//")
    ) {
      throw new DomainError(
        "INVALID_ARGUMENT",
        "Return evidence must be uploaded under your return evidence folder.",
      );
    }
  }
}

function findOrderItem(order: OrderDocument, orderItemId: string) {
  return order.items.find(
    (item) =>
      item.variantId === orderItemId ||
      item.sku === orderItemId ||
      `${item.productId}:${item.variantId}` === orderItemId ||
      item.productId === orderItemId,
  );
}

function proratedLineAmount(orderItem: OrderDocument["items"][number]) {
  return Math.floor(orderItem.lineTotal.amountMinor / orderItem.quantity);
}

function calculateRefundAmount(
  order: OrderDocument,
  items: z.infer<typeof createReturnCommandSchema>["items"],
  policy: ReturnPolicy,
) {
  const subtotal = items.reduce((total, item) => {
    const orderItem = findOrderItem(order, item.orderItemId);
    if (!orderItem) return total;
    return total + proratedLineAmount(orderItem) * item.quantity;
  }, 0);
  const fee =
    policy.restockingFee.currency === order.totals.currency
      ? Math.min(policy.restockingFee.amountMinor, subtotal)
      : 0;
  return {
    amountMinor: Math.max(0, subtotal - fee),
    currency: order.totals.currency,
  };
}

export class ReturnService {
  constructor(private readonly firestore: Firestore) {}

  async create(
    userId: string,
    input: z.input<typeof createReturnCommandSchema>,
  ) {
    const command = createReturnCommandSchema.parse(input);
    assertOwnedEvidencePaths(userId, command.evidencePaths);
    const policy = await this.readReturnPolicy();
    const requestedAt = Timestamp.now();

    return this.firestore.runTransaction(async (transaction) => {
      const orderRef = this.firestore.collection("orders").doc(command.orderId);
      const settingsRef = this.firestore
        .collection("settings")
        .doc("returns.policy");
      const existingReturnsQuery = this.firestore
        .collection("returns")
        .where("userId", "==", userId)
        .where("orderId", "==", command.orderId);
      const [orderSnapshot, settingsSnapshot, existingReturns] =
        await Promise.all([
          transaction.get(orderRef),
          transaction.get(settingsRef),
          transaction.get(existingReturnsQuery),
        ]);

      const transactionPolicy = settingsSnapshot.exists
        ? returnPolicySchema.parse(
            settingsDocumentSchema.parse(settingsSnapshot.data()).value,
          )
        : policy;
      if (!orderSnapshot.exists) {
        throw new DomainError(
          "NOT_FOUND",
          "The delivered order was not found.",
        );
      }
      const order = orderDocumentSchema.parse(orderSnapshot.data());
      if (order.userId !== userId) {
        throw new DomainError(
          "FORBIDDEN",
          "This order belongs to another customer.",
        );
      }
      if (!transactionPolicy.eligibleStatuses.includes(order.status)) {
        throw new DomainError(
          "PRECONDITION_FAILED",
          "This order status is not eligible for returns.",
        );
      }
      const returnWindowEndsAt = Timestamp.fromMillis(
        asDate(order.placedAt).getTime() +
          transactionPolicy.windowDays * 86_400_000,
      );
      if (requestedAt.toMillis() > returnWindowEndsAt.toMillis()) {
        throw new DomainError(
          "PRECONDITION_FAILED",
          "The return window for this order has closed.",
        );
      }

      const requestedByVariant = new Map<string, number>();
      const returnItems = command.items.map((item) => {
        if (!transactionPolicy.reasons.includes(item.reason)) {
          throw new DomainError(
            "INVALID_ARGUMENT",
            "Choose an allowed return reason.",
          );
        }
        const orderItem = findOrderItem(order, item.orderItemId);
        if (!orderItem) {
          throw new DomainError(
            "NOT_FOUND",
            "The selected order item was not found.",
          );
        }
        requestedByVariant.set(
          orderItem.variantId,
          (requestedByVariant.get(orderItem.variantId) ?? 0) + item.quantity,
        );
        return {
          orderItemId: item.orderItemId,
          productId: orderItem.productId,
          variantId: orderItem.variantId,
          sku: orderItem.sku,
          quantity: item.quantity,
          reason: item.reason,
        };
      });

      for (const orderItem of order.items) {
        const requestedQuantity =
          requestedByVariant.get(orderItem.variantId) ?? 0;
        if (requestedQuantity > orderItem.quantity) {
          throw new DomainError(
            "PRECONDITION_FAILED",
            "Return quantity exceeds the quantity ordered.",
          );
        }
      }

      const alreadyReturnedByVariant = new Map<string, number>();
      for (const returnSnapshot of existingReturns.docs) {
        const existing = returnDocumentSchema.parse(returnSnapshot.data());
        if (!ACTIVE_RETURN_STATUSES.has(existing.status)) continue;
        for (const item of existing.items) {
          alreadyReturnedByVariant.set(
            item.variantId,
            (alreadyReturnedByVariant.get(item.variantId) ?? 0) + item.quantity,
          );
        }
      }
      for (const orderItem of order.items) {
        const totalRequested =
          (requestedByVariant.get(orderItem.variantId) ?? 0) +
          (alreadyReturnedByVariant.get(orderItem.variantId) ?? 0);
        if (totalRequested > orderItem.quantity) {
          throw new DomainError(
            "CONFLICT",
            "This item quantity is already covered by another return request.",
          );
        }
      }

      const reference = this.firestore.collection("returns").doc();
      const refundAmount = calculateRefundAmount(
        order,
        command.items,
        transactionPolicy,
      );
      transaction.create(reference, {
        orderId: command.orderId,
        userId,
        items: returnItems,
        status: "REQUESTED",
        evidencePaths: command.evidencePaths,
        customerNote: command.customerNote,
        staffNote: null,
        refundPaymentId: null,
        refundId: null,
        refundAmount,
        policyVersion: transactionPolicy.version,
        restockingFee: transactionPolicy.restockingFee,
        restoreResellableStock: transactionPolicy.restoreResellableStock,
        returnWindowEndsAt,
        condition: "UNINSPECTED",
        requestedAt: FieldValue.serverTimestamp(),
        approvedAt: null,
        rejectedAt: null,
        receivedAt: null,
        refundedAt: null,
        archivedAt: null,
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      } satisfies Omit<
        ReturnDocument,
        "requestedAt" | "createdAt" | "updatedAt" | "returnWindowEndsAt"
      > & {
        requestedAt: FieldValue;
        createdAt: FieldValue;
        updatedAt: FieldValue;
        returnWindowEndsAt: Timestamp;
      });
      transaction.update(orderRef, {
        status: "RETURN_REQUESTED",
        updatedAt: FieldValue.serverTimestamp(),
      });
      audit(this.firestore, transaction, {
        actorId: userId,
        targetType: "return",
        targetId: reference.id,
        metadata: {
          event: "create",
          orderId: command.orderId,
          policyVersion: transactionPolicy.version,
          itemCount: returnItems.length,
          refundAmount: refundAmount.amountMinor,
        },
      });
      return {
        returnId: reference.id,
        status: "REQUESTED" as const,
        policyVersion: transactionPolicy.version,
        refundAmount,
      };
    });
  }

  private async readReturnPolicy() {
    const snapshot = await this.firestore
      .collection("settings")
      .doc("returns.policy")
      .get();
    if (!snapshot.exists) return returnPolicySchema.parse({});
    const settings = settingsDocumentSchema.parse(snapshot.data());
    return returnPolicySchema.parse(settings.value);
  }
}
