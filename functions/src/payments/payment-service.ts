import {
  DomainError,
  documentIdSchema,
  orderDocumentSchema,
  paymentDocumentSchema,
  paymentWebhookEventSchema,
  refundInputSchema,
  returnDocumentSchema,
} from "@bazm/domain";
import {
  FieldValue,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { z } from "zod";

import { EmailService } from "../email/email-service.js";
import { InventoryService } from "../inventory/inventory-service.js";

export const paymentIntentCommandSchema = z
  .object({ orderId: documentIdSchema })
  .strict();

type WebhookEvent = z.infer<typeof paymentWebhookEventSchema>;

export class PaymentService {
  private readonly inventory: InventoryService;
  private readonly email: EmailService;

  constructor(private readonly firestore: Firestore) {
    this.inventory = new InventoryService(firestore);
    this.email = new EmailService(firestore);
  }

  async createAttempt(userId: string, orderId: string) {
    const orderSnapshot = await this.firestore
      .collection("orders")
      .doc(orderId)
      .get();
    if (!orderSnapshot.exists)
      throw new DomainError("NOT_FOUND", "The order does not exist.");
    const order = orderDocumentSchema.parse(orderSnapshot.data());
    if (order.userId !== userId)
      throw new DomainError(
        "FORBIDDEN",
        "This order belongs to another customer.",
      );
    if (!order.paymentId)
      throw new DomainError(
        "PRECONDITION_FAILED",
        "This order has no payment record.",
      );
    const paymentRef = this.firestore
      .collection("payments")
      .doc(order.paymentId);
    const paymentSnapshot = await paymentRef.get();
    if (!paymentSnapshot.exists)
      throw new DomainError("NOT_FOUND", "The payment record is missing.");
    const payment = paymentDocumentSchema.parse(paymentSnapshot.data());
    if (payment.status === "PAID")
      return {
        paymentId: paymentRef.id,
        status: payment.status,
        redirectUrl: null,
      };
    if (payment.status !== "PENDING" && payment.status !== "REQUIRES_ACTION")
      throw new DomainError(
        "PRECONDITION_FAILED",
        "This payment can no longer be attempted.",
      );
    const attemptRef = this.firestore
      .collection("paymentAttempts")
      .doc(paymentRef.id);
    const providerReference = `sandbox_${paymentRef.id}_${attemptRef.id}`;
    await this.firestore.runTransaction(async (transaction) => {
      const [current, previousAttempt] = await Promise.all([
        transaction.get(paymentRef),
        transaction.get(attemptRef),
      ]);
      if (!current.exists)
        throw new DomainError("NOT_FOUND", "The payment record is missing.");
      const currentPayment = paymentDocumentSchema.parse(current.data());
      if (
        currentPayment.status !== "PENDING" &&
        currentPayment.status !== "REQUIRES_ACTION"
      )
        throw new DomainError(
          "PRECONDITION_FAILED",
          "This payment can no longer be attempted.",
        );
      if (previousAttempt.exists) return;
      transaction.update(paymentRef, {
        status: "REQUIRES_ACTION",
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(attemptRef, {
        paymentId: paymentRef.id,
        orderId,
        userId,
        provider: payment.provider,
        status: "REQUIRES_ACTION",
        providerReference,
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    return {
      paymentId: paymentRef.id,
      status: "REQUIRES_ACTION" as const,
      redirectUrl: `/checkout/payment/sandbox?attempt=${attemptRef.id}`,
    };
  }

  async processWebhook(event: WebhookEvent) {
    const eventRef = this.firestore
      .collection("paymentWebhookEvents")
      .doc(event.eventId);
    const duplicate = await eventRef.get();
    if (duplicate.exists) return { ok: true, duplicate: true };
    const paymentRef = this.firestore
      .collection("payments")
      .doc(event.paymentId);
    const paymentSnapshot = await paymentRef.get();
    if (!paymentSnapshot.exists)
      throw new DomainError("NOT_FOUND", "Unknown payment.");
    const payment = paymentDocumentSchema.parse(paymentSnapshot.data());
    if (
      payment.amount.amountMinor !== event.amountMinor ||
      payment.amount.currency !== event.currency
    )
      throw new DomainError(
        "PRECONDITION_FAILED",
        "Webhook amount or currency does not match the payment.",
      );
    if (event.occurredAt.getTime() < Date.now() - 7 * 24 * 60 * 60 * 1000)
      throw new DomainError("PRECONDITION_FAILED", "Webhook event is stale.");
    if (["PAID", "FAILED", "CANCELLED"].includes(payment.status)) {
      await eventRef.create({
        paymentId: event.paymentId,
        outcome: "IGNORED",
        createdAt: FieldValue.serverTimestamp(),
      });
      return { ok: true, duplicate: true };
    }
    const orderRef = this.firestore.collection("orders").doc(payment.orderId);
    let appliedStatus: WebhookEvent["status"] | null = null;
    await this.firestore.runTransaction(async (transaction) => {
      const [currentPayment, currentOrder, seen] = await Promise.all([
        transaction.get(paymentRef),
        transaction.get(orderRef),
        transaction.get(eventRef),
      ]);
      if (seen.exists) return;
      if (!currentPayment.exists)
        throw new DomainError("NOT_FOUND", "Unknown payment.");
      if (!currentOrder.exists)
        throw new DomainError("NOT_FOUND", "The payment order is missing.");
      const current = paymentDocumentSchema.parse(currentPayment.data());
      if (["PAID", "FAILED", "CANCELLED"].includes(current.status)) return;
      const status = event.status;
      appliedStatus = status;
      const currentOrderData = orderDocumentSchema.parse(currentOrder.data());
      await this.applyInventoryOutcome(
        transaction,
        currentOrderData.reservationId,
        status,
      );
      transaction.update(paymentRef, {
        status,
        providerPaymentId: event.providerPaymentId,
        providerEventIds: [...current.providerEventIds, event.eventId].slice(
          -20,
        ),
        paidAt: status === "PAID" ? FieldValue.serverTimestamp() : null,
        failureCode: status === "PAID" ? null : status,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(orderRef, {
        status: status === "PAID" ? "PAID" : "CANCELLED",
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(eventRef, {
        paymentId: paymentRef.id,
        orderId: orderRef.id,
        outcome: status,
        createdAt: FieldValue.serverTimestamp(),
      });
      transaction.create(this.firestore.collection("auditLogs").doc(), {
        action: "PAYMENT",
        actorId: null,
        targetType: "payment",
        targetId: paymentRef.id,
        metadata: { status, amount: event.amountMinor },
        correlationId: `webhook_${event.eventId}`,
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    if (!appliedStatus) return { ok: true, duplicate: true };
    if (appliedStatus === "PAID") {
      await this.email.sendPaymentReceived(payment.orderId, paymentRef.id);
    } else {
      await this.email.sendPaymentFailed(paymentRef.id, appliedStatus);
    }
    return { ok: true, duplicate: false };
  }

  private async applyInventoryOutcome(
    transaction: Transaction,
    reservationId: string | null,
    status: WebhookEvent["status"],
  ) {
    if (!reservationId) return;
    if (status === "PAID") {
      await this.inventory.finalizeInTransaction(
        transaction,
        reservationId,
        null,
      );
      return;
    }
    await this.inventory.releaseInTransaction(
      transaction,
      reservationId,
      null,
      "Payment did not complete.",
    );
  }

  async initiateRefund(
    actorId: string,
    input: z.input<typeof refundInputSchema>,
  ) {
    const command = refundInputSchema.parse(input);
    const paymentRef = this.firestore
      .collection("payments")
      .doc(command.paymentId);
    const refundRef = this.firestore
      .collection("refunds")
      .doc(`${paymentRef.id}_${command.idempotencyKey}`);
    const returnRef = command.returnId
      ? this.firestore.collection("returns").doc(command.returnId)
      : null;
    const result = await this.firestore.runTransaction(async (transaction) => {
      const [
        paymentSnapshot,
        currentRefund,
        pendingRefunds,
        returnSnapshot,
        returnRefunds,
      ] = await Promise.all([
        transaction.get(paymentRef),
        transaction.get(refundRef),
        transaction.get(
          this.firestore
            .collection("refunds")
            .where("paymentId", "==", paymentRef.id)
            .where("status", "==", "PENDING"),
        ),
        returnRef ? transaction.get(returnRef) : Promise.resolve(null),
        command.returnId
          ? transaction.get(
              this.firestore
                .collection("refunds")
                .where("returnId", "==", command.returnId)
                .limit(20),
            )
          : Promise.resolve(null),
      ]);
      if (!paymentSnapshot.exists)
        throw new DomainError("NOT_FOUND", "The payment record is missing.");
      if (currentRefund.exists)
        return {
          refundId: refundRef.id,
          status: currentRefund.get("status"),
          idempotent: true,
        };
      const payment = paymentDocumentSchema.parse(paymentSnapshot.data());
      if (command.returnId) {
        if (!returnSnapshot?.exists)
          throw new DomainError(
            "NOT_FOUND",
            "The linked return request is missing.",
          );
        const returnRequest = returnDocumentSchema.parse(returnSnapshot.data());
        if (returnRequest.orderId !== payment.orderId) {
          throw new DomainError(
            "PRECONDITION_FAILED",
            "The linked return does not belong to this payment order.",
          );
        }
        if (returnRequest.status !== "RECEIVED") {
          throw new DomainError(
            "PRECONDITION_FAILED",
            "Only received returns can be refunded.",
          );
        }
        if (
          !returnRequest.refundAmount ||
          command.amount.currency !== returnRequest.refundAmount.currency ||
          command.amount.amountMinor > returnRequest.refundAmount.amountMinor
        ) {
          throw new DomainError(
            "PRECONDITION_FAILED",
            "Refund amount exceeds this return's eligible amount.",
          );
        }
        const activeReturnRefund = returnRefunds?.docs.find((snapshot) =>
          ["PENDING", "COMPLETED"].includes(String(snapshot.get("status"))),
        );
        if (activeReturnRefund) {
          return {
            refundId: activeReturnRefund.id,
            status: activeReturnRefund.get("status"),
            idempotent: true,
          };
        }
      }
      if (payment.status !== "PAID" && payment.status !== "PARTIALLY_REFUNDED")
        throw new DomainError(
          "PRECONDITION_FAILED",
          "Only paid payments can be refunded.",
        );
      const pendingAmount = pendingRefunds.docs.reduce(
        (total, snapshot) =>
          total +
          (snapshot.get("amount") as { amountMinor: number }).amountMinor,
        0,
      );
      if (
        payment.refundedAmount.amountMinor +
          pendingAmount +
          command.amount.amountMinor >
        payment.amount.amountMinor
      )
        throw new DomainError(
          "PRECONDITION_FAILED",
          "Refund exceeds the paid amount.",
        );
      transaction.create(refundRef, {
        paymentId: paymentRef.id,
        orderId: payment.orderId,
        returnId: command.returnId,
        amount: command.amount,
        reason: command.reason,
        status: "PENDING",
        actorId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(this.firestore.collection("auditLogs").doc(), {
        action: "PAYMENT",
        actorId,
        targetType: "refund",
        targetId: refundRef.id,
        metadata: {
          event: "refund-initiate",
          paymentId: paymentRef.id,
          amount: command.amount.amountMinor,
          returnLinked: Boolean(command.returnId),
        },
        correlationId: `refund_${refundRef.id.slice(0, 100)}`,
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
      });
      return {
        refundId: refundRef.id,
        status: "PENDING" as const,
        idempotent: false,
      };
    });
    if (!result.idempotent)
      await this.email.sendRefundInitiated(result.refundId);
    return result;
  }

  async completeRefund(refundId: string, succeeded: boolean, eventId?: string) {
    const refundRef = this.firestore.collection("refunds").doc(refundId);
    const eventRef = eventId
      ? this.firestore.collection("refundWebhookEvents").doc(eventId)
      : null;
    let outcome: "COMPLETED" | "FAILED" | null = null;
    const result = await this.firestore.runTransaction(async (transaction) => {
      const [currentRefund, existingEvent] = await Promise.all([
        transaction.get(refundRef),
        eventRef ? transaction.get(eventRef) : Promise.resolve(null),
      ]);
      if (existingEvent?.exists) return { duplicate: true };
      if (!currentRefund.exists)
        throw new DomainError("NOT_FOUND", "Refund request is missing.");
      if (currentRefund.get("status") !== "PENDING") {
        if (eventRef)
          transaction.create(eventRef, {
            refundId,
            outcome: "IGNORED",
            createdAt: FieldValue.serverTimestamp(),
          });
        return { duplicate: true };
      }
      if (!succeeded) {
        const paymentId = currentRefund.get("paymentId");
        transaction.update(refundRef, {
          status: "FAILED",
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.create(this.firestore.collection("auditLogs").doc(), {
          action: "PAYMENT",
          actorId:
            typeof currentRefund.get("actorId") === "string"
              ? currentRefund.get("actorId")
              : null,
          targetType: "refund",
          targetId: refundRef.id,
          metadata: {
            event: "refund-failed",
            paymentId: typeof paymentId === "string" ? paymentId : "unknown",
          },
          correlationId: eventId
            ? `refund_webhook_${eventId.slice(0, 100)}`
            : `refund_${refundRef.id.slice(0, 100)}`,
          schemaVersion: 1,
          createdAt: FieldValue.serverTimestamp(),
        });
        outcome = "FAILED";
        if (eventRef)
          transaction.create(eventRef, {
            refundId,
            outcome: "FAILED",
            createdAt: FieldValue.serverTimestamp(),
          });
        return { duplicate: false };
      }
      const paymentId = currentRefund.get("paymentId");
      if (typeof paymentId !== "string")
        throw new DomainError(
          "INTERNAL",
          "Refund payment reference is invalid.",
        );
      const paymentRef = this.firestore.collection("payments").doc(paymentId);
      const returnId = currentRefund.get("returnId");
      const returnRef =
        typeof returnId === "string" && returnId.length > 0
          ? this.firestore.collection("returns").doc(returnId)
          : null;
      const [paymentSnapshot, returnSnapshot] = await Promise.all([
        transaction.get(paymentRef),
        returnRef ? transaction.get(returnRef) : Promise.resolve(null),
      ]);
      if (!paymentSnapshot.exists)
        throw new DomainError("NOT_FOUND", "The payment record is missing.");
      const payment = paymentDocumentSchema.parse(paymentSnapshot.data());
      const returnRequest =
        returnRef && returnSnapshot?.exists
          ? returnDocumentSchema.parse(returnSnapshot.data())
          : null;
      if (returnRef && !returnRequest) {
        throw new DomainError(
          "NOT_FOUND",
          "The linked return request is missing.",
        );
      }
      if (returnRequest && returnRequest.status !== "RECEIVED") {
        throw new DomainError(
          "PRECONDITION_FAILED",
          "Only received returns can be marked refunded.",
        );
      }
      const amount = currentRefund.get("amount") as {
        amountMinor: number;
        currency: "PKR";
      };
      const next = payment.refundedAmount.amountMinor + amount.amountMinor;
      transaction.update(paymentRef, {
        refundedAmount: { amountMinor: next, currency: "PKR" },
        status:
          next === payment.amount.amountMinor
            ? "REFUNDED"
            : "PARTIALLY_REFUNDED",
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(refundRef, {
        status: "COMPLETED",
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(this.firestore.collection("auditLogs").doc(), {
        action: "PAYMENT",
        actorId:
          typeof currentRefund.get("actorId") === "string"
            ? currentRefund.get("actorId")
            : null,
        targetType: "refund",
        targetId: refundRef.id,
        metadata: {
          event: "refund-complete",
          paymentId: paymentRef.id,
          amount: amount.amountMinor,
          returnLinked: Boolean(returnRef),
        },
        correlationId: eventId
          ? `refund_webhook_${eventId.slice(0, 100)}`
          : `refund_${refundRef.id.slice(0, 100)}`,
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
      });
      if (returnRef && returnRequest) {
        const orderStatus =
          next === payment.amount.amountMinor ? "REFUNDED" : "RETURNED";
        transaction.update(returnRef, {
          status: "REFUNDED",
          refundId,
          refundPaymentId: paymentRef.id,
          refundedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.update(
          this.firestore.collection("orders").doc(payment.orderId),
          {
            status: orderStatus,
            updatedAt: FieldValue.serverTimestamp(),
          },
        );
        transaction.create(this.firestore.collection("auditLogs").doc(), {
          action: "RETURN",
          actorId: currentRefund.get("actorId") ?? null,
          targetType: "return",
          targetId: returnRef.id,
          metadata: {
            event: "refund-complete",
            refundId,
            amount: amount.amountMinor,
            orderStatus,
          },
          correlationId: `refund_${refundId.slice(0, 100)}`,
          schemaVersion: 1,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      outcome = "COMPLETED";
      if (eventRef)
        transaction.create(eventRef, {
          refundId,
          outcome: "COMPLETED",
          createdAt: FieldValue.serverTimestamp(),
        });
      return { duplicate: false };
    });
    if (!result.duplicate && outcome === "COMPLETED") {
      await this.email.sendRefundCompleted(refundId);
    }
    if (!result.duplicate && outcome === "FAILED") {
      await this.email.sendRefundFailed(refundId);
    }
    return result;
  }
}
