import {
  cartItemDocumentSchema,
  checkoutIntentSchema,
  couponDocumentSchema,
  customerAddressDocumentSchema,
  DomainError,
  orderDocumentSchema,
  orderTransitionInputSchema,
  paymentDocumentSchema,
  productDocumentSchema,
  productVariantDocumentSchema,
  type Money,
} from "@bazm/domain";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { EmailService } from "../email/email-service.js";
import { InventoryService } from "../inventory/inventory-service.js";

export const checkoutCommandSchema = checkoutIntentSchema;
export const orderTransitionCommandSchema = orderTransitionInputSchema;

type PreparedLine = {
  productId: string;
  variantId: string;
  sku: string;
  quantity: number;
  productName: string;
  color: string;
  size: string;
  unitPrice: Money;
  media: z.infer<typeof cartItemDocumentSchema>["snapshot"]["image"];
};

type PreparedCoupon = { id: string } | null;

function money(amountMinor: number): Money {
  if (
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 0 ||
    amountMinor > 999_999_999
  )
    throw new DomainError("PRECONDITION_FAILED", "The order total is invalid.");
  return { amountMinor, currency: "PKR" };
}

function asDate(value: Date | { toDate: () => Date }) {
  return value instanceof Date ? value : value.toDate();
}

function validateCoupon(
  coupon: z.infer<typeof couponDocumentSchema>,
  subtotal: number,
  now: Date,
) {
  if (
    coupon.status !== "ACTIVE" ||
    asDate(coupon.startsAt) > now ||
    asDate(coupon.endsAt) <= now
  )
    throw new DomainError("PRECONDITION_FAILED", "This coupon is not active.");
  if (
    coupon.minimumOrderAmount &&
    subtotal < coupon.minimumOrderAmount.amountMinor
  )
    throw new DomainError(
      "PRECONDITION_FAILED",
      "This order does not meet the coupon minimum.",
    );
  if (coupon.usageLimit !== null && coupon.redemptionCount >= coupon.usageLimit)
    throw new DomainError(
      "PRECONDITION_FAILED",
      "This coupon has reached its usage limit.",
    );
  const raw =
    coupon.discount.kind === "PERCENTAGE"
      ? Math.floor((subtotal * coupon.discount.percentage) / 100)
      : coupon.discount.amount.amountMinor;
  const capped = coupon.maximumDiscountAmount
    ? Math.min(raw, coupon.maximumDiscountAmount.amountMinor)
    : raw;
  return Math.min(subtotal, capped);
}

function shippingFor(subtotal: number, deliveryMethod: "STANDARD" | "EXPRESS") {
  if (subtotal >= 100_000) return 0;
  return deliveryMethod === "EXPRESS" ? 500 : 250;
}

export function isAllowedOrderTransition(from: string, to: string) {
  return (
    (from === "PENDING_PAYMENT" && to === "PAID") ||
    (from === "PAID" && to === "PROCESSING") ||
    (from === "PROCESSING" && to === "SHIPPED") ||
    (from === "SHIPPED" && to === "DELIVERED")
  );
}

export class OrderService {
  private readonly inventory: InventoryService;
  private readonly email: EmailService;

  constructor(private readonly firestore: Firestore) {
    this.inventory = new InventoryService(firestore);
    this.email = new EmailService(firestore);
  }

  async createAddress(userId: string, input: unknown) {
    const address = customerAddressDocumentSchema
      .omit({ schemaVersion: true, createdAt: true, updatedAt: true })
      .parse(input);
    const reference = this.firestore
      .collection("users")
      .doc(userId)
      .collection("addresses")
      .doc();
    await reference.create({
      ...address,
      schemaVersion: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { id: reference.id };
  }

  async updateAddress(userId: string, addressId: string, input: unknown) {
    const patch = z
      .object({
        label: z.string().trim().min(2).max(60).optional(),
        recipientName: z.string().trim().min(2).max(80).optional(),
        phone: z
          .string()
          .trim()
          .regex(/^\+92\d{10}$/)
          .optional(),
        line1: z.string().trim().min(3).max(120).optional(),
        line2: z.string().trim().min(1).max(120).nullable().optional(),
        area: z.string().trim().min(2).max(80).optional(),
        city: z.string().trim().min(2).max(80).optional(),
        province: z.string().trim().min(2).max(80).optional(),
        postalCode: z
          .string()
          .trim()
          .regex(/^\d{5}$/)
          .optional(),
        deliveryInstructions: z
          .string()
          .trim()
          .min(1)
          .max(300)
          .nullable()
          .optional(),
      })
      .strict()
      .refine(
        (value) => Object.keys(value).length > 0,
        "Provide an address change.",
      )
      .parse(input);
    const reference = this.firestore
      .collection("users")
      .doc(userId)
      .collection("addresses")
      .doc(addressId);
    if (!(await reference.get()).exists)
      throw new DomainError("NOT_FOUND", "The address does not exist.");
    await reference.update({
      ...patch,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { id: addressId };
  }

  async checkout(userId: string, input: z.input<typeof checkoutCommandSchema>) {
    const command = checkoutCommandSchema.parse(input);
    const registryRef = this.firestore
      .collection("checkoutRequests")
      .doc(`${userId}_${command.idempotencyKey}`);
    const previous = await registryRef.get();
    if (previous.exists)
      return { orderId: previous.get("orderId") as string, idempotent: true };

    const [shippingSnapshot, billingSnapshot, cart] = await Promise.all([
      this.firestore
        .collection("users")
        .doc(userId)
        .collection("addresses")
        .doc(command.shippingAddressId)
        .get(),
      command.billingAddressId
        ? this.firestore
            .collection("users")
            .doc(userId)
            .collection("addresses")
            .doc(command.billingAddressId)
            .get()
        : Promise.resolve(null),
      this.firestore
        .collection("carts")
        .doc(userId)
        .collection("items")
        .limit(51)
        .get(),
    ]);
    if (!shippingSnapshot.exists)
      throw new DomainError(
        "NOT_FOUND",
        "Select one of your saved shipping addresses.",
      );
    if (cart.empty || cart.size > 50)
      throw new DomainError(
        "PRECONDITION_FAILED",
        "Your cart is empty or too large.",
      );
    const shippingAddress = customerAddressDocumentSchema.parse(
      shippingSnapshot.data(),
    );
    const billingAddress = billingSnapshot?.exists
      ? customerAddressDocumentSchema.parse(billingSnapshot.data())
      : shippingAddress;
    const lines = await this.prepareLines(cart.docs.map((item) => item.data()));
    const subtotal = lines.reduce(
      (total, line) => total + line.unitPrice.amountMinor * line.quantity,
      0,
    );
    let preparedCoupon: PreparedCoupon = null;
    if (command.couponCode) {
      const matches = await this.firestore
        .collection("coupons")
        .where("displayCode", "==", command.couponCode)
        .limit(1)
        .get();
      if (matches.empty)
        throw new DomainError("NOT_FOUND", "This coupon does not exist.");
      preparedCoupon = { id: matches.docs[0].id };
      validateCoupon(
        couponDocumentSchema.parse(matches.docs[0].data()),
        subtotal,
        new Date(),
      );
    }

    const reservation = await this.inventory.reserve(
      {
        idempotencyKey: command.idempotencyKey,
        lines: lines.map((line) => ({
          sku: line.sku,
          quantity: line.quantity,
        })),
      },
      userId,
    );
    if (reservation.status !== "ACTIVE")
      throw new DomainError(
        "PRECONDITION_FAILED",
        "This checkout reservation is unavailable.",
      );

    let result: { orderId: string; idempotent: boolean };
    try {
      result = await this.firestore.runTransaction(async (transaction) => {
        const existing = await transaction.get(registryRef);
        if (existing.exists)
          return {
            orderId: existing.get("orderId") as string,
            idempotent: true,
          };
        let discount = 0;
        let couponId: string | null = null;
        let couponCode: string | null = null;
        if (preparedCoupon) {
          const couponRef = this.firestore
            .collection("coupons")
            .doc(preparedCoupon.id);
          const couponSnapshot = await transaction.get(couponRef);
          if (!couponSnapshot.exists)
            throw new DomainError("NOT_FOUND", "This coupon does not exist.");
          const coupon = couponDocumentSchema.parse(couponSnapshot.data());
          discount = validateCoupon(coupon, subtotal, new Date());
          const redemptions = await transaction.get(
            this.firestore
              .collection("couponRedemptions")
              .where("couponId", "==", preparedCoupon.id)
              .where("userId", "==", userId)
              .limit(50),
          );
          if (
            coupon.perCustomerLimit !== null &&
            redemptions.size >= coupon.perCustomerLimit
          )
            throw new DomainError(
              "PRECONDITION_FAILED",
              "You have already used this coupon.",
            );
          transaction.update(couponRef, {
            redemptionCount: coupon.redemptionCount + 1,
            updatedAt: FieldValue.serverTimestamp(),
          });
          couponId = preparedCoupon.id;
          couponCode = coupon.displayCode;
        }
        const shipping = shippingFor(
          subtotal - discount,
          command.deliveryMethod,
        );
        const orderRef = this.firestore.collection("orders").doc();
        const paymentRef = this.firestore.collection("payments").doc();
        const items = lines.map((line) => ({
          productId: line.productId,
          variantId: line.variantId,
          productName: line.productName,
          sku: line.sku,
          color: line.color,
          size: line.size,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountAmount: money(0),
          taxAmount: money(0),
          lineTotal: money(line.unitPrice.amountMinor * line.quantity),
          media: line.media,
        }));
        const totals = {
          subtotal: money(subtotal),
          discount: money(discount),
          shipping: money(shipping),
          tax: money(0),
          grandTotal: money(subtotal - discount + shipping),
          currency: "PKR" as const,
        };
        transaction.create(orderRef, {
          userId,
          status: "PENDING_PAYMENT",
          items,
          shippingAddress: this.addressSnapshot(shippingAddress),
          billingAddress: this.addressSnapshot(billingAddress),
          totals,
          couponId,
          couponCode,
          paymentId: paymentRef.id,
          reservationId: reservation.reservationId,
          checkoutIdempotencyKey: command.idempotencyKey,
          paymentMethod: command.paymentMethod,
          trackingNumber: null,
          deliveryMethod: command.deliveryMethod,
          policyVersion: "2026-08",
          customerNote: command.customerNote,
          adminNote: null,
          placedAt: FieldValue.serverTimestamp(),
          archivedAt: null,
          schemaVersion: 1,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.create(paymentRef, {
          orderId: orderRef.id,
          userId,
          provider: command.paymentMethod === "CARD" ? "SANDBOX" : "COD",
          providerPaymentId: null,
          amount: totals.grandTotal,
          refundedAmount: money(0),
          status: "PENDING",
          idempotencyKey: `payment_${userId}_${command.idempotencyKey}`,
          failureCode: null,
          providerEventIds: [],
          paidAt: null,
          schemaVersion: 1,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        if (couponId)
          transaction.create(
            this.firestore.collection("couponRedemptions").doc(),
            {
              couponId,
              userId,
              orderId: orderRef.id,
              amount: money(discount),
              schemaVersion: 1,
              createdAt: FieldValue.serverTimestamp(),
            },
          );
        transaction.create(registryRef, {
          orderId: orderRef.id,
          reservationId: reservation.reservationId,
          userId,
          createdAt: FieldValue.serverTimestamp(),
        });
        transaction.create(this.firestore.collection("auditLogs").doc(), {
          action: "ORDER",
          actorId: userId,
          targetType: "order",
          targetId: orderRef.id,
          metadata: { type: "CHECKOUT", total: totals.grandTotal.amountMinor },
          correlationId: `checkout_${orderRef.id}`,
          schemaVersion: 1,
          createdAt: FieldValue.serverTimestamp(),
        });
        for (const item of cart.docs) transaction.delete(item.ref);
        return { orderId: orderRef.id, idempotent: false };
      });
    } catch (error) {
      if (!reservation.idempotent)
        await this.inventory.release(
          reservation.reservationId,
          userId,
          "Checkout failed before the order could be created.",
        );
      throw error;
    }
    if (!result.idempotent) await this.email.sendOrderPlaced(result.orderId);
    return result;
  }

  async cancel(userId: string, orderId: string) {
    const orderRef = this.firestore.collection("orders").doc(orderId);
    const snapshot = await orderRef.get();
    if (!snapshot.exists)
      throw new DomainError("NOT_FOUND", "The order does not exist.");
    const order = orderDocumentSchema.parse(snapshot.data());
    if (order.userId !== userId)
      throw new DomainError(
        "FORBIDDEN",
        "This order belongs to another customer.",
      );
    if (order.status !== "PENDING_PAYMENT")
      throw new DomainError(
        "PRECONDITION_FAILED",
        "Only unpaid orders can be cancelled.",
      );
    if (order.reservationId)
      await this.inventory.release(
        order.reservationId,
        userId,
        "Customer cancelled unpaid order.",
      );
    let cancelled = false;
    await this.firestore.runTransaction(async (transaction) => {
      const current = await transaction.get(orderRef);
      if (!current.exists)
        throw new DomainError("NOT_FOUND", "The order does not exist.");
      if (current.get("status") !== "PENDING_PAYMENT") return;
      cancelled = true;
      transaction.update(orderRef, {
        status: "CANCELLED",
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(this.firestore.collection("auditLogs").doc(), {
        action: "ORDER",
        actorId: userId,
        targetType: "order",
        targetId: orderId,
        metadata: { type: "CANCELLED" },
        correlationId: `cancel_${orderId}`,
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    if (cancelled)
      await this.email.sendOrderCancelled(
        orderId,
        "Customer cancelled before payment.",
      );
    return { orderId, status: "CANCELLED" as const };
  }

  async transition(
    actorId: string,
    input: z.input<typeof orderTransitionCommandSchema>,
  ) {
    const command = orderTransitionCommandSchema.parse(input);
    const reference = this.firestore.collection("orders").doc(command.orderId);
    const initial = await reference.get();
    if (!initial.exists)
      throw new DomainError("NOT_FOUND", "The order does not exist.");
    const initialOrder = orderDocumentSchema.parse(initial.data());
    if (
      initialOrder.status === "PENDING_PAYMENT" &&
      command.status === "PAID" &&
      initialOrder.reservationId
    )
      await this.inventory.finalize(initialOrder.reservationId, actorId);
    let paymentId: string | null = null;
    const result = await this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists)
        throw new DomainError("NOT_FOUND", "The order does not exist.");
      const order = orderDocumentSchema.parse(snapshot.data());
      if (!isAllowedOrderTransition(order.status, command.status))
        throw new DomainError(
          "PRECONDITION_FAILED",
          "That order transition is not allowed.",
        );
      if (command.status === "SHIPPED" && !command.trackingNumber)
        throw new DomainError(
          "PRECONDITION_FAILED",
          "Add a tracking number before shipping.",
        );
      paymentId = order.paymentId;
      const paymentRef = order.paymentId
        ? this.firestore.collection("payments").doc(order.paymentId)
        : null;
      const paymentSnapshot =
        command.status === "PAID" && paymentRef
          ? await transaction.get(paymentRef)
          : null;
      transaction.update(reference, {
        status: command.status,
        trackingNumber:
          command.status === "SHIPPED"
            ? command.trackingNumber
            : order.trackingNumber,
        adminNote: command.reason ?? order.adminNote,
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (command.status === "PAID" && paymentRef && paymentSnapshot?.exists) {
        const payment = paymentDocumentSchema.parse(paymentSnapshot.data());
        if (payment.provider === "COD" && payment.status === "PENDING") {
          transaction.update(paymentRef, {
            status: "PAID",
            paidAt: FieldValue.serverTimestamp(),
            failureCode: null,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
      }
      transaction.create(this.firestore.collection("auditLogs").doc(), {
        action: "ORDER",
        actorId,
        targetType: "order",
        targetId: command.orderId,
        metadata: { from: order.status, to: command.status },
        correlationId: `transition_${command.orderId}_${command.status}`,
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { orderId: command.orderId, status: command.status };
    });
    if (result.status === "PAID" && paymentId) {
      await this.email.sendPaymentReceived(result.orderId, paymentId);
    }
    if (result.status === "SHIPPED") {
      await this.email.sendOrderShipped(result.orderId);
    }
    if (result.status === "DELIVERED") {
      await this.email.sendOrderDelivered(result.orderId);
    }
    return result;
  }

  private async prepareLines(rawItems: unknown[]): Promise<PreparedLine[]> {
    return Promise.all(
      rawItems.map(async (raw) => {
        const cartItem = cartItemDocumentSchema.parse(raw);
        const productRef = this.firestore
          .collection("products")
          .doc(cartItem.productId);
        const [productSnapshot, variantSnapshot] = await Promise.all([
          productRef.get(),
          productRef.collection("variants").doc(cartItem.variantId).get(),
        ]);
        if (!productSnapshot.exists || !variantSnapshot.exists)
          throw new DomainError(
            "PRECONDITION_FAILED",
            "A cart item is no longer available.",
          );
        const product = productDocumentSchema.parse(productSnapshot.data());
        const variant = productVariantDocumentSchema.parse(
          variantSnapshot.data(),
        );
        if (
          product.status !== "PUBLISHED" ||
          !variant.isActive ||
          variant.productId !== cartItem.productId
        )
          throw new DomainError(
            "PRECONDITION_FAILED",
            "A cart item is no longer available.",
          );
        return {
          productId: cartItem.productId,
          variantId: cartItem.variantId,
          sku: variant.sku,
          quantity: cartItem.requestedQuantity,
          productName: product.name,
          color: variant.color,
          size: variant.size,
          unitPrice: variant.priceOverride ?? product.basePrice,
          media: variant.media[0] ?? product.media[0],
        };
      }),
    );
  }

  private addressSnapshot(
    address: z.infer<typeof customerAddressDocumentSchema>,
  ) {
    return {
      recipientName: address.recipientName,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2,
      area: address.area,
      city: address.city,
      province: address.province,
      postalCode: address.postalCode,
      deliveryInstructions: address.deliveryInstructions,
    };
  }
}
