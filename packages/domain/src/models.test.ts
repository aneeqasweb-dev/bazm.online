import { describe, expect, it } from "vitest";

import {
  adminAuditLogReadSchema,
  adminCategoryReadSchema,
  adminCouponReadSchema,
  adminInventoryReadSchema,
  adminInventoryTransactionReadSchema,
  adminOrderReadSchema,
  adminPaymentReadSchema,
  adminProductReadSchema,
  adminReturnReadSchema,
  adminReviewReadSchema,
  adminSettingsReadSchema,
  adminSupportTicketReadSchema,
  adminUserReadSchema,
  cartDocumentSchema,
  checkoutIntentSchema,
  createReviewInputSchema,
  customerNotificationReadSchema,
  emailDeliveryDocumentSchema,
  customerProfileUpdateInputSchema,
  customerRegistrationInputSchema,
  publicCategoryReadSchema,
  publicProductReadSchema,
  publicReviewReadSchema,
  userDocumentSchema,
  wishlistItemDocumentSchema,
} from "./models.js";

describe("domain document coverage", () => {
  it("exports a strict read contract for every planned core collection", () => {
    expect([
      adminUserReadSchema,
      adminProductReadSchema,
      adminCategoryReadSchema,
      adminInventoryReadSchema,
      adminInventoryTransactionReadSchema,
      cartDocumentSchema,
      wishlistItemDocumentSchema,
      adminOrderReadSchema,
      adminPaymentReadSchema,
      adminReviewReadSchema,
      adminCouponReadSchema,
      adminReturnReadSchema,
      customerNotificationReadSchema,
      adminSupportTicketReadSchema,
      adminAuditLogReadSchema,
      adminSettingsReadSchema,
      emailDeliveryDocumentSchema,
    ]).toHaveLength(17);
  });

  it("accepts the existing trusted user profile shape", () => {
    const timestamp = new Date("2026-08-29T12:00:00.000Z");
    expect(
      userDocumentSchema.parse({
        name: "Aneeqa Pervaiz",
        email: "ANEEQA@example.com",
        phone: null,
        avatarUrl: null,
        avatarPath: null,
        role: "CUSTOMER",
        isActive: true,
        emailVerified: true,
        schemaVersion: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      }),
    ).toMatchObject({ email: "aneeqa@example.com", role: "CUSTOMER" });
  });

  it("blocks privileged fields in customer DTOs and public projections", () => {
    expect(
      customerRegistrationInputSchema.safeParse({
        name: "Aneeqa Pervaiz",
        role: "ADMIN",
      }).success,
    ).toBe(false);
    expect(
      customerProfileUpdateInputSchema.safeParse({
        name: "Aneeqa Pervaiz",
        phone: null,
        avatarPath: null,
        isActive: false,
      }).success,
    ).toBe(false);
    expect(
      checkoutIntentSchema.safeParse({
        shippingAddressId: "address-1",
        billingAddressId: null,
        couponCode: null,
        deliveryMethod: "STANDARD",
        customerNote: null,
        totals: { grandTotal: 1 },
      }).success,
    ).toBe(false);
    expect(
      publicProductReadSchema.safeParse({
        id: "product-1",
        status: "DRAFT",
      }).success,
    ).toBe(false);
    expect(
      publicCategoryReadSchema.safeParse({
        id: "category-1",
        status: "ARCHIVED",
      }).success,
    ).toBe(false);
  });

  it("keeps review moderation under trusted control", () => {
    expect(
      createReviewInputSchema.safeParse({
        productId: "product-1",
        orderId: "order-1",
        variantId: "variant-1",
        rating: 5,
        title: "Beautiful fit",
        content: "The fabric and finishing were both excellent.",
        status: "PUBLISHED",
      }).success,
    ).toBe(false);
  });

  it("accepts owned review media in customer and public review contracts", () => {
    const timestamp = new Date("2026-08-29T12:00:00.000Z");
    const image = {
      path: "reviews/customer-1/review-image.webp",
      url: "https://firebasestorage.googleapis.com/review-image.webp",
      alt: "Review image",
      width: 800,
      height: 1000,
      contentType: "image/webp",
      contentHash: "reviewimagehash0001",
      sortOrder: 0,
    };

    expect(
      createReviewInputSchema.parse({
        productId: "product-1",
        orderId: "order-1",
        variantId: "variant-1",
        rating: 5,
        title: "Beautiful fit",
        content: "The fabric and finishing were both excellent.",
        images: [image],
      }),
    ).toMatchObject({ variantId: "variant-1", images: [image] });
    expect(
      publicReviewReadSchema.parse({
        id: "review-1",
        rating: 5,
        title: "Beautiful fit",
        content: "The fabric and finishing were both excellent.",
        authorName: "Aneeqa Pervaiz",
        verifiedPurchase: true,
        images: [image],
        createdAt: timestamp,
      }),
    ).toMatchObject({ images: [image], verifiedPurchase: true });
  });
});
