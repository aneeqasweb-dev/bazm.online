import {
  checkoutIntentSchema,
  demoPaymentMethodSchema,
  documentIdSchema,
  DomainError,
  orderDocumentSchema,
  paymentDocumentSchema,
} from "@bazm/domain";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { randomUUID } from "node:crypto";
import { setTimeout } from "node:timers/promises";
import { z } from "zod";

import { InventoryService } from "../inventory/inventory-service.js";
import { OrderService } from "../orders/order-service.js";

const newDemoPaymentSchema = z
  .object({
    checkout: checkoutIntentSchema.extend({
      paymentMethod: demoPaymentMethodSchema,
    }),
    mobileNumber: z
      .string()
      .trim()
      .regex(/^(?:03\d{9}|\+923\d{9})$/)
      .optional(),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.checkout.paymentMethod !== "CARD" && !input.mobileNumber) {
      context.addIssue({
        code: "custom",
        path: ["mobileNumber"],
        message: "Enter a Pakistani mobile number.",
      });
    }
    if (input.checkout.paymentMethod === "CARD" && input.mobileNumber) {
      context.addIssue({
        code: "custom",
        path: ["mobileNumber"],
        message: "Card checkout does not use a mobile wallet.",
      });
    }
  });

// No card fields, client-provided amounts, user IDs, or success flags are accepted.
export const demoPaymentRequestSchema = z.union([
  newDemoPaymentSchema,
  z.object({ orderId: documentIdSchema }).strict(),
]);

type Order = z.infer<typeof orderDocumentSchema>;
type Payment = z.infer<typeof paymentDocumentSchema>;

export class DemoPaymentService {
  constructor(private readonly firestore: Firestore) {}

  async createOrder(
    userId: string,
    input: z.infer<typeof newDemoPaymentSchema>,
  ) {
    const parsed = newDemoPaymentSchema.parse(input);
    const result = await new OrderService(this.firestore).checkout(
      userId,
      parsed.checkout,
      { demoPayment: true },
    );
    const { order } = await this.readOwnedPayment(userId, result.orderId);
    if (order.paymentMethod !== parsed.checkout.paymentMethod)
      throw new DomainError(
        "CONFLICT",
        "This checkout already uses a different payment method.",
      );
    return result;
  }

  private validate(
    userId: string,
    order: Order,
    payment: Payment,
    orderId: string,
  ) {
    if (order.userId !== userId || payment.userId !== userId)
      throw new DomainError(
        "FORBIDDEN",
        "This order belongs to another customer.",
      );
    if (!order.isDemo || payment.provider !== "DEMO")
      throw new DomainError(
        "PRECONDITION_FAILED",
        "Only demo orders can use simulated payments.",
      );
    if (
      payment.orderId !== orderId ||
      payment.method !== order.paymentMethod ||
      payment.amount.amountMinor !== order.totals.grandTotal.amountMinor ||
      payment.amount.currency !== order.totals.grandTotal.currency
    )
      throw new DomainError(
        "PRECONDITION_FAILED",
        "The payment does not match this order.",
      );
  }

  private async readOwnedPayment(userId: string, orderId: string) {
    const orderRef = this.firestore
      .collection("orders")
      .doc(documentIdSchema.parse(orderId));
    const snapshot = await orderRef.get();
    if (!snapshot.exists)
      throw new DomainError("NOT_FOUND", "The order does not exist.");
    const order = orderDocumentSchema.parse(snapshot.data());
    if (order.userId !== userId)
      throw new DomainError(
        "FORBIDDEN",
        "This order belongs to another customer.",
      );
    if (!order.paymentId)
      throw new DomainError(
        "PRECONDITION_FAILED",
        "The order has no payment record.",
      );
    const paymentRef = this.firestore
      .collection("payments")
      .doc(order.paymentId);
    const paymentSnapshot = await paymentRef.get();
    if (!paymentSnapshot.exists)
      throw new DomainError("NOT_FOUND", "The payment record is missing.");
    const payment = paymentDocumentSchema.parse(paymentSnapshot.data());
    this.validate(userId, order, payment, orderId);
    return { orderRef, paymentRef, order, payment };
  }

  async complete(userId: string, orderId: string) {
    const initial = await this.readOwnedPayment(userId, orderId);
    if (initial.payment.status === "PAID")
      return this.receipt(orderId, initial.order, initial.payment);
    if (
      initial.order.status !== "PENDING_PAYMENT" ||
      initial.payment.status !== "PENDING"
    )
      throw new DomainError(
        "PRECONDITION_FAILED",
        "This order can no longer be paid.",
      );

    // Deliberate gateway simulation. No network call to a payment provider is made.
    await setTimeout(2000);
    const transactionId = `txn_demo_${randomUUID().replaceAll("-", "")}`;
    await this.firestore.runTransaction(async (transaction) => {
      const [orderSnapshot, paymentSnapshot] = await Promise.all([
        transaction.get(initial.orderRef),
        transaction.get(initial.paymentRef),
      ]);
      if (!orderSnapshot.exists || !paymentSnapshot.exists)
        throw new DomainError("NOT_FOUND", "The order or payment is missing.");
      const order = orderDocumentSchema.parse(orderSnapshot.data());
      const payment = paymentDocumentSchema.parse(paymentSnapshot.data());
      this.validate(userId, order, payment, orderId);
      if (order.paymentId !== initial.paymentRef.id)
        throw new DomainError(
          "CONFLICT",
          "The order payment changed. Please reload.",
        );
      if (payment.status === "PAID") return;
      if (
        order.status !== "PENDING_PAYMENT" ||
        payment.status !== "PENDING" ||
        !order.reservationId
      )
        throw new DomainError(
          "PRECONDITION_FAILED",
          "This order can no longer be paid.",
        );
      const reservation = await new InventoryService(
        this.firestore,
      ).finalizeInTransaction(transaction, order.reservationId, userId);
      if (reservation.status !== "FINALIZED")
        throw new DomainError(
          "PRECONDITION_FAILED",
          "Your item reservation is no longer available. Please start a new order.",
        );
      transaction.update(initial.paymentRef, {
        status: "PAID",
        transactionId,
        providerPaymentId: initial.paymentRef.id,
        paidAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(initial.orderRef, {
        status: "PAID",
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(this.firestore.collection("auditLogs").doc(), {
        action: "PAYMENT",
        actorId: userId,
        targetType: "payment",
        targetId: initial.paymentRef.id,
        metadata: {
          type: "DEMO_PAYMENT",
          method: payment.method,
          transactionId,
          amount: payment.amount.amountMinor,
        },
        correlationId: `demo_${initial.paymentRef.id}`,
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    // Read the winning transaction so concurrent retries return identical IDs.
    const result = await this.readOwnedPayment(userId, orderId);
    return this.receipt(orderId, result.order, result.payment);
  }

  async confirmation(userId: string, orderId: string) {
    const result = await this.readOwnedPayment(userId, orderId);
    return {
      ...this.receipt(orderId, result.order, result.payment),
      items: result.order.items,
      totals: result.order.totals,
      shippingAddress: result.order.shippingAddress,
      deliveryMethod: result.order.deliveryMethod,
    };
  }

  private receipt(orderId: string, order: Order, payment: Payment) {
    if (payment.status !== "PAID" || !payment.transactionId || !payment.paidAt)
      throw new DomainError(
        "PRECONDITION_FAILED",
        "Payment has not completed for this order.",
      );
    const paidAt =
      payment.paidAt instanceof Date ? payment.paidAt : payment.paidAt.toDate();
    return {
      isDemo: true as const,
      status: "PAID" as const,
      orderId,
      paymentId: order.paymentId!,
      transactionId: payment.transactionId,
      method: demoPaymentMethodSchema.parse(payment.method),
      amount: payment.amount,
      paidAt: paidAt.toISOString(),
    };
  }
}
