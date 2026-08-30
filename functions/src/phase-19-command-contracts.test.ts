import { describe, expect, it } from "vitest";

import {
  couponStatusCommandSchema,
  createCouponCommandSchema,
  isAllowedReturnTransition,
  moderateReviewCommandSchema,
  updateCouponCommandSchema,
  updateReturnStatusCommandSchema,
  updateUserAccessCommandSchema,
  upsertSettingsCommandSchema,
} from "./admin/admin-service.js";
import {
  categoryStatusCommandSchema,
  reorderCategoriesCommandSchema,
  updateCategoryCommandSchema,
} from "./categories/category-service.js";
import {
  inventoryAdjustmentCommandSchema,
  inventoryQuantityCommandSchema,
  receiveInventoryCommandSchema,
  reservationIdCommandSchema,
  reserveInventoryCommandSchema,
} from "./inventory/inventory-service.js";
import {
  checkoutCommandSchema,
  isAllowedOrderTransition,
  orderTransitionCommandSchema,
} from "./orders/order-service.js";
import { paymentIntentCommandSchema } from "./payments/payment-service.js";
import {
  createProductCommandSchema,
  createVariantCommandSchema,
  productStatusCommandSchema,
  updateProductCommandSchema,
  updateVariantCommandSchema,
} from "./products/product-service.js";
import {
  reportReviewCommandSchema,
  updateReviewCommandSchema,
} from "./reviews/review-service.js";

const start = new Date("2026-09-01T00:00:00.000Z");
const end = new Date("2026-09-30T00:00:00.000Z");

function pkr(amountMinor: number) {
  return { amountMinor, currency: "PKR" as const };
}

function mediaAsset() {
  return {
    alt: "Phase nineteen catalog image",
    contentHash: "phase19cataloghash1",
    contentType: "image/webp" as const,
    height: 1500,
    path: "products/phase-19/primary.webp",
    sortOrder: 0,
    url: "https://firebasestorage.googleapis.com/v0/b/demo/o/phase19.webp?alt=media",
    width: 1200,
  };
}

describe("phase 19 callable command contracts", () => {
  it("rejects unsafe inventory idempotency, duplicate reservation lines, and no-op movement", () => {
    expect(
      receiveInventoryCommandSchema.parse({
        productId: "product-1",
        quantity: 5,
        reason: "Initial stock receipt",
        sku: "p19-sku-1",
        variantId: "variant-1",
      }).sku,
    ).toBe("P19-SKU-1");
    expect(
      inventoryAdjustmentCommandSchema.safeParse({
        delta: 0,
        reason: "No movement",
        sku: "P19-SKU-1",
      }).success,
    ).toBe(false);
    expect(
      inventoryQuantityCommandSchema.safeParse({
        quantity: 1_000,
        reason: "Too many units",
        sku: "P19-SKU-1",
      }).success,
    ).toBe(false);
    expect(
      reserveInventoryCommandSchema.safeParse({
        idempotencyKey: "unsafe key",
        lines: [{ quantity: 1, sku: "P19-SKU-1" }],
      }).success,
    ).toBe(false);
    expect(
      reserveInventoryCommandSchema.safeParse({
        idempotencyKey: "phase19reserve",
        lines: [
          { quantity: 1, sku: "p19-sku-1" },
          { quantity: 1, sku: "P19-SKU-1" },
        ],
      }).success,
    ).toBe(false);
    expect(
      reservationIdCommandSchema.safeParse({ reservationId: "bad/path" })
        .success,
    ).toBe(false);
  });

  it("keeps product, category, review, and settings patches non-empty and strict", () => {
    expect(
      createProductCommandSchema.parse({
        basePrice: pkr(125_000),
        categoryId: "category-1",
        description:
          "A phase nineteen product with enough descriptive copy for validation.",
        media: [mediaAsset()],
        name: "Phase Nineteen Product",
        slug: "phase-nineteen-product",
      }),
    ).toMatchObject({
      brand: "Bazm",
      flags: { featured: false, newArrival: false },
    });
    expect(updateProductCommandSchema.safeParse({}).success).toBe(false);
    expect(
      createVariantCommandSchema.safeParse({
        productId: "product-1",
        variant: {
          color: "Black",
          media: [],
          size: "M",
          sku: "p19-sku-1",
        },
      }).success,
    ).toBe(true);
    expect(
      updateVariantCommandSchema.safeParse({
        productId: "product-1",
        variant: {},
        variantId: "variant-1",
      }).success,
    ).toBe(false);
    expect(
      productStatusCommandSchema.safeParse({
        id: "product-1",
        status: "DELETED",
      }).success,
    ).toBe(false);
    expect(updateCategoryCommandSchema.safeParse({}).success).toBe(false);
    expect(
      categoryStatusCommandSchema.safeParse({
        id: "category-1",
        status: "ACTIVE",
      }).success,
    ).toBe(true);
    expect(
      reorderCategoriesCommandSchema.safeParse({
        categoryIds: ["category-1", "category-1"],
        parentId: null,
      }).success,
    ).toBe(false);
    expect(
      updateReviewCommandSchema.safeParse({
        input: {},
        reviewId: "review-1",
      }).success,
    ).toBe(false);
    expect(reportReviewCommandSchema.parse({ reviewId: "review-1" })).toEqual({
      reason: "Customer reported this review.",
      reviewId: "review-1",
    });
    expect(
      upsertSettingsCommandSchema.safeParse({
        expectedRevision: 1,
        key: "returns.policy",
        value: { blob: "x".repeat(12_001) },
        visibility: "PRIVATE",
      }).success,
    ).toBe(false);
  });

  it("validates admin access, coupon, payment, checkout, and return commands", () => {
    expect(
      updateUserAccessCommandSchema.parse({
        isActive: true,
        role: "STAFF",
        userId: "user-1",
      }).permissions,
    ).toEqual([]);
    expect(
      createCouponCommandSchema.safeParse({
        code: "P19-SAVE",
        discount: { kind: "PERCENTAGE", percentage: 20 },
        endsAt: end,
        startsAt: start,
      }).success,
    ).toBe(true);
    expect(
      updateCouponCommandSchema.safeParse({
        code: "P19-SAVE",
        id: "coupon-1",
      }).success,
    ).toBe(false);
    expect(
      couponStatusCommandSchema.safeParse({
        id: "coupon-1",
        status: "ACTIVE",
      }).success,
    ).toBe(true);
    expect(
      moderateReviewCommandSchema.safeParse({
        reviewId: "review-1",
        status: "REJECTED",
      }).success,
    ).toBe(false);
    expect(
      paymentIntentCommandSchema.safeParse({
        method: "CARD",
        orderId: "order-1",
      }).success,
    ).toBe(false);
    expect(
      checkoutCommandSchema.parse({
        billingAddressId: null,
        couponCode: "p19-save",
        customerNote: null,
        deliveryMethod: "EXPRESS",
        idempotencyKey: "phase19checkout",
        shippingAddressId: "address-1",
      }).couponCode,
    ).toBe("P19-SAVE");
    expect(
      orderTransitionCommandSchema.parse({
        orderId: "order-1",
        status: "SHIPPED",
        trackingNumber: "TRK-19",
      }),
    ).toMatchObject({ reason: null, trackingNumber: "TRK-19" });
    expect(
      updateReturnStatusCommandSchema.safeParse({
        condition: "UNINSPECTED",
        returnId: "return-1",
        status: "RECEIVED",
      }).success,
    ).toBe(false);
    expect(
      updateReturnStatusCommandSchema.safeParse({
        refundAmount: pkr(1_000),
        refundIdempotencyKey: "refund-19",
        refundPaymentId: "payment-1",
        refundReason: "Approved return",
        returnId: "return-1",
        status: "REFUNDED",
      }).success,
    ).toBe(true);
  });

  it("documents allowed order and return state-machine transitions", () => {
    expect(
      (
        [
          ["PENDING_PAYMENT", "PAID"],
          ["PAID", "PROCESSING"],
          ["PROCESSING", "SHIPPED"],
          ["SHIPPED", "DELIVERED"],
        ] as const
      ).every(([from, to]) => isAllowedOrderTransition(from, to)),
    ).toBe(true);
    expect(
      (
        [
          ["PENDING_PAYMENT", "PROCESSING"],
          ["PAID", "DELIVERED"],
          ["DELIVERED", "SHIPPED"],
          ["CANCELLED", "PAID"],
          ["PAID", "PAID"],
        ] as const
      ).some(([from, to]) => isAllowedOrderTransition(from, to)),
    ).toBe(false);

    expect(
      (
        [
          ["REQUESTED", "REQUESTED"],
          ["REQUESTED", "APPROVED"],
          ["REQUESTED", "REJECTED"],
          ["APPROVED", "RECEIVED"],
          ["RECEIVED", "REFUNDED"],
          ["REFUNDED", "CLOSED"],
        ] as const
      ).every(([from, to]) => isAllowedReturnTransition(from, to)),
    ).toBe(true);
    expect(
      (
        [
          ["REQUESTED", "RECEIVED"],
          ["REJECTED", "APPROVED"],
          ["CLOSED", "REQUESTED"],
          ["REFUNDED", "RECEIVED"],
        ] as const
      ).some(([from, to]) => isAllowedReturnTransition(from, to)),
    ).toBe(false);
  });
});
