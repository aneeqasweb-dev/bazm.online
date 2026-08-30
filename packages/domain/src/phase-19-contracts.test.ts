import { describe, expect, it } from "vitest";

import {
  applyCouponInputSchema,
  checkoutIntentSchema,
  couponDiscountSchema,
  createCouponInputSchema,
  createReturnInputSchema,
  inventoryDocumentSchema,
  inventoryReservationDocumentSchema,
  inventoryTransactionDocumentSchema,
  orderDocumentSchema,
  orderTotalsSchema,
  paymentWebhookEventSchema,
  refundInputSchema,
  returnPolicySchema,
} from "./models.js";
import {
  moneySchema,
  nonNegativeQuantitySchema,
  positiveMoneySchema,
  quantitySchema,
} from "./primitives.js";

const now = new Date("2026-08-29T12:00:00.000Z");

function pkr(amountMinor: number) {
  return { amountMinor, currency: "PKR" as const };
}

function mediaAsset() {
  return {
    alt: "Phase nineteen product image",
    contentHash: "phase19imagehash0001",
    contentType: "image/webp" as const,
    height: 1500,
    path: "products/phase-19/primary.webp",
    sortOrder: 0,
    url: "https://firebasestorage.googleapis.com/v0/b/demo/o/phase19.webp?alt=media",
    width: 1200,
  };
}

function address() {
  return {
    area: "Gulberg",
    city: "Lahore",
    deliveryInstructions: null,
    line1: "19 Testing Road",
    line2: null,
    phone: "+923001234567",
    postalCode: "54000",
    province: "PUNJAB" as const,
    recipientName: "Phase Nineteen Customer",
  };
}

function orderItem(index = 1) {
  return {
    color: "Black",
    discountAmount: pkr(0),
    lineTotal: pkr(125_000),
    media: mediaAsset(),
    productId: `product-${index}`,
    productName: `Phase Nineteen Item ${index}`,
    quantity: 1,
    size: "M",
    sku: `P19-SKU-${index}`,
    taxAmount: pkr(0),
    unitPrice: pkr(125_000),
    variantId: `variant-${index}`,
  };
}

describe("phase 19 domain boundary contracts", () => {
  it("keeps money and quantity calculations in bounded integer minor units", () => {
    expect(moneySchema.parse(pkr(999_999_999))).toEqual(pkr(999_999_999));
    expect(positiveMoneySchema.parse(pkr(1))).toEqual(pkr(1));
    expect(nonNegativeQuantitySchema.parse(0)).toBe(0);
    expect(quantitySchema.parse(999)).toBe(999);

    expect(moneySchema.safeParse(pkr(-1)).success).toBe(false);
    expect(moneySchema.safeParse(pkr(1_000_000_000)).success).toBe(false);
    expect(
      moneySchema.safeParse({ amountMinor: 1.25, currency: "PKR" }).success,
    ).toBe(false);
    expect(
      moneySchema.safeParse({ amountMinor: 1, currency: "USD" }).success,
    ).toBe(false);
    expect(positiveMoneySchema.safeParse(pkr(0)).success).toBe(false);
    expect(nonNegativeQuantitySchema.safeParse(-1).success).toBe(false);
    expect(quantitySchema.safeParse(0).success).toBe(false);
    expect(quantitySchema.safeParse(1_000).success).toBe(false);
  });

  it("normalizes coupon codes and rejects invalid discount/date boundaries", () => {
    const start = new Date("2026-09-01T00:00:00.000Z");
    const end = new Date("2026-09-30T00:00:00.000Z");

    expect(
      createCouponInputSchema.parse({
        code: " save-19 ",
        discount: { kind: "PERCENTAGE", percentage: 15 },
        endsAt: end,
        startsAt: start,
      }),
    ).toMatchObject({
      code: "SAVE-19",
      maximumDiscountAmount: null,
      minimumOrderAmount: null,
      perCustomerLimit: null,
      usageLimit: null,
    });
    expect(applyCouponInputSchema.parse({ code: " save-19 " })).toEqual({
      code: "SAVE-19",
    });

    expect(
      couponDiscountSchema.safeParse({
        kind: "PERCENTAGE",
        percentage: 0,
      }).success,
    ).toBe(false);
    expect(
      couponDiscountSchema.safeParse({
        kind: "PERCENTAGE",
        percentage: 101,
      }).success,
    ).toBe(false);
    expect(
      couponDiscountSchema.safeParse({ amount: pkr(0), kind: "FIXED" }).success,
    ).toBe(false);
    expect(
      createCouponInputSchema.safeParse({
        code: "SAVE 19",
        discount: { kind: "FIXED", amount: pkr(500) },
        endsAt: end,
        startsAt: start,
      }).success,
    ).toBe(false);
    expect(
      createCouponInputSchema.safeParse({
        code: "SAVE19",
        discount: { kind: "FIXED", amount: pkr(500) },
        endsAt: start,
        startsAt: start,
      }).success,
    ).toBe(false);
  });

  it("protects inventory counters, ledger movement, and reservation bounds", () => {
    const inventory = {
      available: 0,
      createdAt: now,
      damaged: 0,
      productId: "product-1",
      reorderPoint: 0,
      reserved: 0,
      reservedUntil: null,
      returned: 0,
      schemaVersion: 1,
      sku: "P19-SKU-1",
      sold: 0,
      updatedAt: now,
      variantId: "variant-1",
    };
    const zeroDeltas = {
      available: 0,
      damaged: 0,
      reserved: 0,
      returned: 0,
      sold: 0,
    };

    expect(inventoryDocumentSchema.parse(inventory)).toMatchObject({
      available: 0,
      sku: "P19-SKU-1",
    });
    expect(
      inventoryDocumentSchema.safeParse({ ...inventory, available: -1 })
        .success,
    ).toBe(false);
    expect(
      inventoryTransactionDocumentSchema.safeParse({
        actorId: null,
        correlationId: "phase19-ledger",
        counterDeltas: zeroDeltas,
        createdAt: now,
        delta: 0,
        orderId: null,
        reason: "Cycle count verification",
        resultingAvailable: 0,
        schemaVersion: 1,
        sku: "P19-SKU-1",
        type: "ADJUSTMENT",
      }).success,
    ).toBe(false);
    expect(
      inventoryTransactionDocumentSchema.parse({
        actorId: "user-1",
        correlationId: "phase19-reserve",
        counterDeltas: { ...zeroDeltas, available: -1, reserved: 1 },
        createdAt: now,
        delta: -1,
        orderId: null,
        reason: "Checkout reservation",
        resultingAvailable: 0,
        schemaVersion: 1,
        sku: "p19-sku-1",
        type: "RESERVATION",
      }).counterDeltas?.reserved,
    ).toBe(1);
    expect(
      inventoryReservationDocumentSchema.parse({
        createdAt: now,
        finalizedAt: null,
        idempotencyKey: "phase19-reserve",
        lines: [{ quantity: 1, sku: "p19-sku-1" }],
        releasedAt: null,
        reservedUntil: now,
        schemaVersion: 1,
        status: "ACTIVE",
        updatedAt: now,
        userId: "user-1",
      }).lines[0].sku,
    ).toBe("P19-SKU-1");
    expect(
      inventoryReservationDocumentSchema.safeParse({
        createdAt: now,
        finalizedAt: null,
        idempotencyKey: "phase19-reserve",
        lines: Array.from({ length: 21 }, (_, index) => ({
          quantity: 1,
          sku: `P19-SKU-${index}`,
        })),
        releasedAt: null,
        reservedUntil: now,
        schemaVersion: 1,
        status: "ACTIVE",
        updatedAt: now,
        userId: "user-1",
      }).success,
    ).toBe(false);
  });

  it("keeps checkout and order snapshots bounded and internally consistent", () => {
    const checkout = checkoutIntentSchema.parse({
      billingAddressId: null,
      couponCode: " save19 ",
      customerNote: null,
      deliveryMethod: "STANDARD",
      idempotencyKey: "phase19_order",
      shippingAddressId: "address-1",
    });

    expect(checkout).toMatchObject({
      couponCode: "SAVE19",
      paymentMethod: "CASH_ON_DELIVERY",
    });
    expect(
      checkoutIntentSchema.safeParse({
        ...checkout,
        idempotencyKey: "unsafe key",
      }).success,
    ).toBe(false);
    expect(
      checkoutIntentSchema.safeParse({ ...checkout, clientTotal: pkr(1) })
        .success,
    ).toBe(false);

    const baseOrder = {
      adminNote: null,
      archivedAt: null,
      billingAddress: address(),
      checkoutIdempotencyKey: checkout.idempotencyKey,
      couponCode: checkout.couponCode,
      couponId: "coupon-1",
      createdAt: now,
      customerNote: null,
      deliveryMethod: "STANDARD" as const,
      items: Array.from({ length: 50 }, (_, index) => orderItem(index + 1)),
      paymentId: "payment-1",
      paymentMethod: "CASH_ON_DELIVERY" as const,
      placedAt: now,
      policyVersion: "2026-08",
      reservationId: "reservation-1",
      schemaVersion: 1,
      shippingAddress: address(),
      status: "PENDING_PAYMENT" as const,
      totals: {
        currency: "PKR" as const,
        discount: pkr(500),
        grandTotal: pkr(6_249_500),
        shipping: pkr(0),
        subtotal: pkr(6_250_000),
        tax: pkr(0),
      },
      trackingNumber: null,
      updatedAt: now,
      userId: "user-1",
    };

    expect(orderDocumentSchema.parse(baseOrder).items).toHaveLength(50);
    expect(
      orderDocumentSchema.safeParse({ ...baseOrder, items: [] }).success,
    ).toBe(false);
    expect(
      orderDocumentSchema.safeParse({
        ...baseOrder,
        items: [...baseOrder.items, orderItem(51)],
      }).success,
    ).toBe(false);
    expect(
      orderTotalsSchema.safeParse({
        ...baseOrder.totals,
        grandTotal: pkr(0),
      }).success,
    ).toBe(false);
  });

  it("validates payment, refund, and return edge-case payloads", () => {
    expect(
      paymentWebhookEventSchema.parse({
        amountMinor: 125_000,
        currency: "PKR",
        eventId: "phase19-paid",
        occurredAt: "2026-08-29T12:00:00.000Z",
        paymentId: "payment-1",
        providerPaymentId: "sandbox-payment-1",
        status: "PAID",
      }).occurredAt,
    ).toBeInstanceOf(Date);
    expect(
      paymentWebhookEventSchema.safeParse({
        amountMinor: 125_000,
        currency: "PKR",
        eventId: "phase19-pending",
        occurredAt: now,
        paymentId: "payment-1",
        providerPaymentId: "sandbox-payment-1",
        status: "PENDING",
      }).success,
    ).toBe(false);
    expect(
      refundInputSchema.safeParse({
        amount: pkr(0),
        idempotencyKey: "refund-19",
        paymentId: "payment-1",
        reason: "Customer return",
      }).success,
    ).toBe(false);
    expect(
      createReturnInputSchema.safeParse({
        customerNote: null,
        evidencePaths: [],
        items: [],
        orderId: "order-1",
      }).success,
    ).toBe(false);
    expect(returnPolicySchema.parse({})).toMatchObject({
      restoreResellableStock: true,
      windowDays: 14,
    });
    expect(returnPolicySchema.safeParse({ windowDays: 366 }).success).toBe(
      false,
    );
  });
});
