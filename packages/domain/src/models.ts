import { z } from "zod";

import {
  addressSchema,
  currencySchema,
  customerNameSchema,
  documentIdSchema,
  documentTimestampsSchema,
  emailSchema,
  firestoreTimestampSchema,
  moneySchema,
  nonNegativeQuantitySchema,
  pakistanPhoneSchema,
  percentageSchema,
  positiveMoneySchema,
  quantitySchema,
  schemaVersionSchema,
  skuSchema,
  slugSchema,
  userIdSchema,
} from "./primitives.js";

const schemaMetadata = {
  schemaVersion: schemaVersionSchema,
  ...documentTimestampsSchema.shape,
};

const archivedAtSchema = firestoreTimestampSchema.nullable();
const nullableShortTextSchema = z.string().trim().min(1).max(160).nullable();
const safeUrlSchema = z.url().max(2_048);
const shortTextSchema = z.string().trim().min(1).max(160);
const longTextSchema = z.string().trim().min(1).max(8_000);
const tagSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(30)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const searchTokenSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(30)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const ratingSummarySchema = z
  .object({
    average: z.number().min(0).max(5),
    count: z.number().int().min(0).max(9_999_999),
  })
  .strict();

export const userRoleSchema = z.enum([
  "CUSTOMER",
  "STAFF",
  "ADMIN",
  "SUPER_ADMIN",
]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const permissionSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[a-z]+(?:\.[a-z]+)*$/);

export const adminPermissionSchema = z.enum([
  "admin.access",
  "catalog.manage",
  "inventory.manage",
  "orders.manage",
  "customers.manage",
  "payments.manage",
  "coupons.manage",
  "reviews.manage",
  "returns.manage",
  "reports.view",
  "settings.manage",
  "audit.view",
  "email.manage",
  "support.manage",
]);
export type AdminPermission = z.infer<typeof adminPermissionSchema>;

export const userDocumentSchema = z
  .object({
    name: customerNameSchema,
    email: emailSchema,
    phone: pakistanPhoneSchema.nullable(),
    avatarUrl: safeUrlSchema.nullable(),
    avatarPath: z.string().trim().min(1).max(180).nullable(),
    role: userRoleSchema,
    permissions: z.array(adminPermissionSchema).max(50).optional(),
    isActive: z.boolean(),
    emailVerified: z.boolean(),
    preferences: z
      .object({
        marketingEmail: z.boolean(),
        analytics: z.boolean().optional(),
      })
      .strict()
      .optional(),
    ...schemaMetadata,
  })
  .strict();

export const customerRegistrationInputSchema = z
  .object({
    name: customerNameSchema,
  })
  .strict();

export const customerProfileUpdateInputSchema = z
  .object({
    name: customerNameSchema,
    phone: pakistanPhoneSchema.nullable(),
    avatarPath: z.string().trim().min(1).max(180).nullable(),
  })
  .strict();

export const customerAddressDocumentSchema = addressSchema
  .extend({ label: z.string().trim().min(2).max(60), ...schemaMetadata })
  .strict();

export const createAddressInputSchema = addressSchema
  .extend({ label: z.string().trim().min(2).max(60) })
  .strict();
export const updateAddressInputSchema = createAddressInputSchema
  .partial()
  .strict();

export const customerProfileReadSchema = z
  .object({
    name: customerNameSchema,
    email: emailSchema,
    phone: pakistanPhoneSchema.nullable(),
    avatarUrl: safeUrlSchema.nullable(),
    avatarPath: z.string().trim().min(1).max(180).nullable(),
    emailVerified: z.boolean(),
  })
  .strict();

export const adminUserReadSchema = userDocumentSchema;

export const productStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);

export const categoryStatusSchema = z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]);

export const seoSchema = z
  .object({
    title: z.string().trim().min(10).max(70).nullable(),
    description: z.string().trim().min(30).max(160).nullable(),
  })
  .strict();

export const mediaAssetSchema = z
  .object({
    path: z.string().trim().min(1).max(500),
    url: safeUrlSchema,
    alt: z.string().trim().min(3).max(180),
    width: z.number().int().min(1).max(10_000),
    height: z.number().int().min(1).max(10_000),
    contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    contentHash: z.string().trim().min(16).max(128),
    sortOrder: z.number().int().min(0).max(100),
  })
  .strict();

export const productVariantDocumentSchema = z
  .object({
    productId: documentIdSchema,
    sku: skuSchema,
    color: shortTextSchema,
    size: shortTextSchema,
    priceOverride: positiveMoneySchema.nullable(),
    media: z.array(mediaAssetSchema).max(8),
    isActive: z.boolean(),
    ...schemaMetadata,
  })
  .strict();

export const productDocumentSchema = z
  .object({
    name: shortTextSchema,
    slug: slugSchema,
    description: longTextSchema,
    categoryId: documentIdSchema,
    categoryPath: z.array(documentIdSchema).min(1).max(4),
    brand: shortTextSchema.default("Bazm"),
    basePrice: positiveMoneySchema,
    media: z.array(mediaAssetSchema).min(1).max(20),
    tags: z.array(tagSchema).max(20),
    searchTokens: z.array(searchTokenSchema).max(60).default([]),
    ratingSummary: ratingSummarySchema.default({ average: 0, count: 0 }),
    flags: z
      .object({
        featured: z.boolean(),
        newArrival: z.boolean(),
      })
      .strict(),
    seo: seoSchema,
    status: productStatusSchema,
    publishedAt: firestoreTimestampSchema.nullable(),
    archivedAt: archivedAtSchema,
    ...schemaMetadata,
  })
  .strict();

export const createProductInputSchema = z
  .object({
    name: shortTextSchema,
    slug: slugSchema,
    description: longTextSchema,
    categoryId: documentIdSchema,
    brand: shortTextSchema.default("Bazm"),
    basePrice: positiveMoneySchema,
    media: z.array(mediaAssetSchema).min(1).max(20),
    tags: z.array(tagSchema).max(20).default([]),
    flags: z
      .object({
        featured: z.boolean().default(false),
        newArrival: z.boolean().default(false),
      })
      .strict()
      .default({ featured: false, newArrival: false }),
    seo: seoSchema.default({ title: null, description: null }),
  })
  .strict();

export const updateProductInputSchema = z
  .object({
    name: shortTextSchema.optional(),
    slug: slugSchema.optional(),
    description: longTextSchema.optional(),
    categoryId: documentIdSchema.optional(),
    brand: shortTextSchema.optional(),
    basePrice: positiveMoneySchema.optional(),
    media: z.array(mediaAssetSchema).min(1).max(20).optional(),
    tags: z.array(tagSchema).max(20).optional(),
    flags: z
      .object({
        featured: z.boolean(),
        newArrival: z.boolean(),
      })
      .strict()
      .optional(),
    seo: seoSchema.optional(),
  })
  .strict();

export const createProductVariantInputSchema = z
  .object({
    sku: skuSchema,
    color: shortTextSchema,
    size: shortTextSchema,
    priceOverride: positiveMoneySchema.nullable().default(null),
    media: z.array(mediaAssetSchema).max(8).default([]),
  })
  .strict();

export const updateProductVariantInputSchema = z
  .object({
    sku: skuSchema.optional(),
    color: shortTextSchema.optional(),
    size: shortTextSchema.optional(),
    priceOverride: positiveMoneySchema.nullable().optional(),
    media: z.array(mediaAssetSchema).max(8).optional(),
  })
  .strict();

export const publicProductReadSchema = z
  .object({
    id: documentIdSchema,
    name: shortTextSchema,
    slug: slugSchema,
    description: longTextSchema,
    categoryId: documentIdSchema,
    categoryPath: z.array(documentIdSchema).min(1).max(4),
    brand: shortTextSchema.default("Bazm"),
    basePrice: positiveMoneySchema,
    media: z.array(mediaAssetSchema).min(1).max(20),
    tags: z.array(tagSchema).max(20),
    ratingSummary: ratingSummarySchema.default({ average: 0, count: 0 }),
    flags: z
      .object({
        featured: z.boolean(),
        newArrival: z.boolean(),
      })
      .strict(),
    seo: seoSchema,
  })
  .strict();

export const adminProductReadSchema = productDocumentSchema.extend({
  id: documentIdSchema,
});

export const categoryDocumentSchema = z
  .object({
    name: shortTextSchema,
    slug: slugSchema,
    parentId: documentIdSchema.nullable(),
    depth: z.number().int().min(0).max(3),
    sortOrder: z.number().int().min(0).max(9_999),
    image: mediaAssetSchema.nullable(),
    seo: seoSchema,
    status: categoryStatusSchema,
    archivedAt: archivedAtSchema,
    ...schemaMetadata,
  })
  .strict();

export const createCategoryInputSchema = z
  .object({
    name: shortTextSchema,
    slug: slugSchema,
    parentId: documentIdSchema.nullable(),
    image: mediaAssetSchema.nullable().default(null),
    seo: seoSchema.default({ title: null, description: null }),
  })
  .strict();

export const updateCategoryInputSchema = z
  .object({
    name: shortTextSchema.optional(),
    slug: slugSchema.optional(),
    parentId: documentIdSchema.nullable().optional(),
    image: mediaAssetSchema.nullable().optional(),
    seo: seoSchema.optional(),
  })
  .strict();

export const publicCategoryReadSchema = z
  .object({
    id: documentIdSchema,
    name: shortTextSchema,
    slug: slugSchema,
    parentId: documentIdSchema.nullable(),
    depth: z.number().int().min(0).max(3),
    sortOrder: z.number().int().min(0).max(9_999),
    image: mediaAssetSchema.nullable(),
    seo: seoSchema,
  })
  .strict();

export const adminCategoryReadSchema = categoryDocumentSchema.extend({
  id: documentIdSchema,
});

export const inventoryDocumentSchema = z
  .object({
    sku: skuSchema,
    productId: documentIdSchema,
    variantId: documentIdSchema,
    available: nonNegativeQuantitySchema,
    reserved: nonNegativeQuantitySchema,
    sold: nonNegativeQuantitySchema,
    returned: nonNegativeQuantitySchema,
    damaged: nonNegativeQuantitySchema,
    reorderPoint: nonNegativeQuantitySchema,
    reservedUntil: firestoreTimestampSchema.nullable(),
    ...schemaMetadata,
  })
  .strict();

export const inventoryTransactionTypeSchema = z.enum([
  "RECEIPT",
  "ADJUSTMENT",
  "RESERVATION",
  "RESERVATION_RELEASE",
  "SALE",
  "RETURN",
  "DAMAGE",
]);

export const inventoryTransactionDocumentSchema = z
  .object({
    sku: skuSchema,
    type: inventoryTransactionTypeSchema,
    // `delta` remains the available-stock movement for compatibility with
    // the initial ledger. Counter deltas make transfers (reserve/finalize)
    // explicit without pretending that they change available stock twice.
    delta: z.number().int().min(-9_999_999).max(9_999_999),
    counterDeltas: z
      .object({
        available: z.number().int().min(-9_999_999).max(9_999_999),
        reserved: z.number().int().min(-9_999_999).max(9_999_999),
        sold: z.number().int().min(-9_999_999).max(9_999_999),
        returned: z.number().int().min(-9_999_999).max(9_999_999),
        damaged: z.number().int().min(-9_999_999).max(9_999_999),
      })
      .strict()
      .optional(),
    reason: z.string().trim().min(3).max(500),
    actorId: userIdSchema.nullable(),
    orderId: documentIdSchema.nullable(),
    resultingAvailable: nonNegativeQuantitySchema,
    correlationId: z.string().trim().min(8).max(128),
    schemaVersion: schemaVersionSchema,
    createdAt: firestoreTimestampSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const changed = value.counterDeltas
      ? Object.values(value.counterDeltas).some((delta) => delta !== 0)
      : value.delta !== 0;
    if (!changed)
      context.addIssue({
        code: "custom",
        path: ["delta"],
        message: "An inventory transaction must change at least one counter.",
      });
  });

export const inventoryAdjustmentInputSchema = z
  .object({
    sku: skuSchema,
    delta: z.number().int().min(-9_999_999).max(9_999_999).refine(Boolean),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const adminInventoryReadSchema = inventoryDocumentSchema.extend({
  id: documentIdSchema,
});

export const adminInventoryTransactionReadSchema =
  inventoryTransactionDocumentSchema.extend({ id: documentIdSchema });

export const inventoryReservationStatusSchema = z.enum([
  "ACTIVE",
  "FINALIZED",
  "RELEASED",
  "EXPIRED",
]);

export const inventoryReservationLineSchema = z
  .object({ sku: skuSchema, quantity: quantitySchema })
  .strict();

export const inventoryReservationDocumentSchema = z
  .object({
    userId: userIdSchema,
    idempotencyKey: z.string().trim().min(8).max(80),
    status: inventoryReservationStatusSchema,
    lines: z.array(inventoryReservationLineSchema).min(1).max(20),
    reservedUntil: firestoreTimestampSchema,
    finalizedAt: firestoreTimestampSchema.nullable(),
    releasedAt: firestoreTimestampSchema.nullable(),
    schemaVersion: schemaVersionSchema,
    createdAt: firestoreTimestampSchema,
    updatedAt: firestoreTimestampSchema,
  })
  .strict();

export const cartDocumentSchema = z
  .object({
    userId: userIdSchema,
    currency: currencySchema,
    expiresAt: firestoreTimestampSchema,
    ...schemaMetadata,
  })
  .strict();

export const cartItemSnapshotSchema = z
  .object({
    name: shortTextSchema,
    slug: slugSchema,
    brand: shortTextSchema,
    image: mediaAssetSchema,
    price: positiveMoneySchema,
    sku: skuSchema,
    color: shortTextSchema,
    size: shortTextSchema,
  })
  .strict();

export const cartItemDocumentSchema = z
  .object({
    productId: documentIdSchema,
    variantId: documentIdSchema,
    requestedQuantity: quantitySchema,
    snapshot: cartItemSnapshotSchema,
    ...schemaMetadata,
  })
  .strict();

export const cartItemIntentSchema = z
  .object({
    variantId: documentIdSchema,
    quantity: quantitySchema,
  })
  .strict();

export const cartReadSchema = z
  .object({
    currency: currencySchema,
    items: z
      .array(
        z
          .object({
            variantId: documentIdSchema,
            requestedQuantity: quantitySchema,
          })
          .strict(),
      )
      .max(50),
  })
  .strict();

export const wishlistItemDocumentSchema = z
  .object({
    productId: documentIdSchema,
    schemaVersion: schemaVersionSchema,
    createdAt: firestoreTimestampSchema,
  })
  .strict();

export const wishlistItemIntentSchema = z
  .object({
    productId: documentIdSchema,
  })
  .strict();

export const wishlistItemReadSchema = z
  .object({
    productId: documentIdSchema,
    createdAt: firestoreTimestampSchema,
  })
  .strict();

export const orderStatusSchema = z.enum([
  "PENDING_PAYMENT",
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "RETURN_REQUESTED",
  "RETURNED",
  "REFUNDED",
]);

export const orderItemSnapshotSchema = z
  .object({
    productId: documentIdSchema,
    variantId: documentIdSchema,
    productName: shortTextSchema,
    sku: skuSchema,
    color: shortTextSchema,
    size: shortTextSchema,
    quantity: quantitySchema,
    unitPrice: positiveMoneySchema,
    discountAmount: moneySchema,
    taxAmount: moneySchema,
    lineTotal: positiveMoneySchema,
    media: mediaAssetSchema.nullable(),
  })
  .strict();

export const orderTotalsSchema = z
  .object({
    subtotal: positiveMoneySchema,
    discount: moneySchema,
    shipping: moneySchema,
    tax: moneySchema,
    grandTotal: positiveMoneySchema,
    currency: currencySchema,
  })
  .strict();

export const orderDocumentSchema = z
  .object({
    userId: userIdSchema,
    status: orderStatusSchema,
    items: z.array(orderItemSnapshotSchema).min(1).max(50),
    shippingAddress: addressSchema,
    billingAddress: addressSchema,
    totals: orderTotalsSchema,
    couponId: documentIdSchema.nullable(),
    couponCode: z.string().trim().min(3).max(40).nullable(),
    paymentId: documentIdSchema.nullable(),
    reservationId: documentIdSchema.nullable().default(null),
    checkoutIdempotencyKey: z.string().trim().min(8).max(80).default("legacy"),
    paymentMethod: z
      .enum(["CARD", "CASH_ON_DELIVERY"])
      .default("CASH_ON_DELIVERY"),
    trackingNumber: z.string().trim().min(3).max(100).nullable().default(null),
    deliveryMethod: z.enum(["STANDARD", "EXPRESS"]),
    policyVersion: z.string().trim().min(1).max(50),
    customerNote: z.string().trim().min(1).max(500).nullable(),
    adminNote: z.string().trim().min(1).max(1_000).nullable(),
    placedAt: firestoreTimestampSchema,
    archivedAt: archivedAtSchema,
    ...schemaMetadata,
  })
  .strict();

export const checkoutIntentSchema = z
  .object({
    idempotencyKey: z
      .string()
      .trim()
      .min(8)
      .max(80)
      .regex(/^[A-Za-z0-9_-]+$/, "Use a safe checkout key."),
    paymentMethod: z
      .enum(["CARD", "CASH_ON_DELIVERY"])
      .default("CASH_ON_DELIVERY"),
    shippingAddressId: documentIdSchema,
    billingAddressId: documentIdSchema.nullable(),
    couponCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{3,40}$/)
      .nullable(),
    deliveryMethod: z.enum(["STANDARD", "EXPRESS"]),
    customerNote: z.string().trim().min(1).max(500).nullable(),
  })
  .strict();

export const orderTransitionInputSchema = z
  .object({
    orderId: documentIdSchema,
    status: orderStatusSchema,
    trackingNumber: z.string().trim().min(3).max(100).nullable().default(null),
    reason: z.string().trim().min(3).max(500).nullable().default(null),
  })
  .strict();

export const customerOrderReadSchema = z
  .object({
    id: documentIdSchema,
    status: orderStatusSchema,
    items: z.array(orderItemSnapshotSchema).min(1).max(50),
    shippingAddress: addressSchema,
    totals: orderTotalsSchema,
    deliveryMethod: z.enum(["STANDARD", "EXPRESS"]),
    placedAt: firestoreTimestampSchema,
  })
  .strict();

export const adminOrderReadSchema = orderDocumentSchema.extend({
  id: documentIdSchema,
});

export const paymentStatusSchema = z.enum([
  "PENDING",
  "REQUIRES_ACTION",
  "AUTHORIZED",
  "PAID",
  "FAILED",
  "CANCELLED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
]);

export const paymentDocumentSchema = z
  .object({
    orderId: documentIdSchema,
    userId: userIdSchema,
    provider: z.enum(["SANDBOX", "COD", "STRIPE", "PAYFAST"]),
    providerPaymentId: z.string().trim().min(1).max(255).nullable(),
    amount: positiveMoneySchema,
    refundedAmount: moneySchema,
    status: paymentStatusSchema,
    idempotencyKey: z.string().trim().min(16).max(255),
    failureCode: nullableShortTextSchema,
    providerEventIds: z.array(z.string().trim().min(1).max(255)).max(20),
    paidAt: firestoreTimestampSchema.nullable(),
    ...schemaMetadata,
  })
  .strict();

export const paymentIntentInputSchema = z
  .object({
    orderId: documentIdSchema,
    method: z.enum(["CARD", "CASH_ON_DELIVERY"]),
  })
  .strict();

export const paymentAttemptDocumentSchema = z
  .object({
    paymentId: documentIdSchema,
    orderId: documentIdSchema,
    userId: userIdSchema,
    provider: z.enum(["SANDBOX", "COD", "STRIPE", "PAYFAST"]),
    status: paymentStatusSchema,
    providerReference: z.string().trim().min(8).max(255),
    schemaVersion: schemaVersionSchema,
    createdAt: firestoreTimestampSchema,
    updatedAt: firestoreTimestampSchema,
  })
  .strict();

export const paymentWebhookEventSchema = z
  .object({
    eventId: z.string().trim().min(8).max(255),
    paymentId: documentIdSchema,
    providerPaymentId: z.string().trim().min(1).max(255),
    status: z.enum(["PAID", "FAILED", "CANCELLED"]),
    amountMinor: z.number().int().min(1).max(999_999_999),
    currency: currencySchema,
    occurredAt: z.coerce.date(),
  })
  .strict();

export const refundInputSchema = z
  .object({
    paymentId: documentIdSchema,
    returnId: documentIdSchema.nullable().default(null),
    idempotencyKey: z
      .string()
      .trim()
      .min(8)
      .max(80)
      .regex(/^[A-Za-z0-9_-]+$/, "Use a safe refund key."),
    amount: positiveMoneySchema,
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const refundStatusSchema = z.enum(["PENDING", "COMPLETED", "FAILED"]);

export const refundDocumentSchema = z
  .object({
    paymentId: documentIdSchema,
    orderId: documentIdSchema,
    returnId: documentIdSchema.nullable().default(null),
    amount: positiveMoneySchema,
    reason: z.string().trim().min(3).max(500),
    status: refundStatusSchema,
    actorId: userIdSchema,
    createdAt: firestoreTimestampSchema,
    updatedAt: firestoreTimestampSchema,
  })
  .strict();

export const customerPaymentReadSchema = z
  .object({
    id: documentIdSchema,
    orderId: documentIdSchema,
    provider: z.enum(["SANDBOX", "COD", "STRIPE", "PAYFAST"]),
    amount: positiveMoneySchema,
    refundedAmount: moneySchema,
    status: paymentStatusSchema,
    paidAt: firestoreTimestampSchema.nullable(),
  })
  .strict();

export const adminPaymentReadSchema = paymentDocumentSchema.extend({
  id: documentIdSchema,
});

export const reviewStatusSchema = z.enum([
  "PENDING",
  "PUBLISHED",
  "REJECTED",
  "HIDDEN",
]);

export const reviewDocumentSchema = z
  .object({
    productId: documentIdSchema,
    orderId: documentIdSchema,
    variantId: documentIdSchema.default("legacy"),
    orderItemKey: z.string().trim().min(8).max(128).default("legacy-item"),
    userId: userIdSchema,
    authorName: customerNameSchema.default("Bazm customer"),
    rating: z.number().int().min(1).max(5),
    title: z.string().trim().min(3).max(120).nullable(),
    content: z.string().trim().min(10).max(2_000),
    images: z.array(mediaAssetSchema).max(5).default([]),
    status: reviewStatusSchema,
    verifiedPurchase: z.boolean(),
    moderationReason: z.string().trim().min(3).max(500).nullable(),
    editableUntil: firestoreTimestampSchema.nullable().default(null),
    lastEditedAt: firestoreTimestampSchema.nullable().default(null),
    editCount: z.number().int().min(0).max(50).default(0),
    reportedCount: z.number().int().min(0).max(999_999).default(0),
    lastReportedAt: firestoreTimestampSchema.nullable().default(null),
    archivedAt: archivedAtSchema,
    ...schemaMetadata,
  })
  .strict();

export const createReviewInputSchema = z
  .object({
    productId: documentIdSchema,
    orderId: documentIdSchema,
    variantId: documentIdSchema,
    rating: z.number().int().min(1).max(5),
    title: z.string().trim().min(3).max(120).nullable(),
    content: z.string().trim().min(10).max(2_000),
    images: z.array(mediaAssetSchema).max(5).default([]),
  })
  .strict();

export const updateReviewInputSchema = z
  .object({
    rating: z.number().int().min(1).max(5).optional(),
    title: z.string().trim().min(3).max(120).nullable().optional(),
    content: z.string().trim().min(10).max(2_000).optional(),
    images: z.array(mediaAssetSchema).max(5).optional(),
  })
  .strict();

export const publicReviewReadSchema = z
  .object({
    id: documentIdSchema,
    rating: z.number().int().min(1).max(5),
    title: z.string().trim().min(3).max(120).nullable(),
    content: z.string().trim().min(10).max(2_000),
    authorName: customerNameSchema,
    verifiedPurchase: z.boolean(),
    images: z.array(mediaAssetSchema).max(5).default([]),
    createdAt: firestoreTimestampSchema,
  })
  .strict();

export const adminReviewReadSchema = reviewDocumentSchema.extend({
  id: documentIdSchema,
});

export const couponStatusSchema = z.enum([
  "DRAFT",
  "ACTIVE",
  "EXPIRED",
  "ARCHIVED",
]);

export const couponDiscountSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("PERCENTAGE"),
      percentage: percentageSchema.refine((value) => value > 0),
      amount: z.never().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("FIXED"),
      percentage: z.never().optional(),
      amount: positiveMoneySchema,
    })
    .strict(),
]);

export const couponDocumentSchema = z
  .object({
    codeHash: z.string().trim().min(32).max(128),
    displayCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{3,40}$/),
    discount: couponDiscountSchema,
    minimumOrderAmount: moneySchema.nullable(),
    maximumDiscountAmount: moneySchema.nullable(),
    startsAt: firestoreTimestampSchema,
    endsAt: firestoreTimestampSchema,
    usageLimit: nonNegativeQuantitySchema.nullable(),
    perCustomerLimit: nonNegativeQuantitySchema.nullable(),
    redemptionCount: nonNegativeQuantitySchema,
    status: couponStatusSchema,
    archivedAt: archivedAtSchema,
    ...schemaMetadata,
  })
  .strict();

export const createCouponInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{3,40}$/),
    discount: couponDiscountSchema,
    minimumOrderAmount: moneySchema.nullable().default(null),
    maximumDiscountAmount: moneySchema.nullable().default(null),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    usageLimit: nonNegativeQuantitySchema.nullable().default(null),
    perCustomerLimit: nonNegativeQuantitySchema.nullable().default(null),
  })
  .strict()
  .refine((coupon) => coupon.endsAt > coupon.startsAt, {
    message: "The coupon end date must be after its start date.",
    path: ["endsAt"],
  });

export const updateCouponInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{3,40}$/)
      .optional(),
    discount: couponDiscountSchema.optional(),
    minimumOrderAmount: moneySchema.nullable().optional(),
    maximumDiscountAmount: moneySchema.nullable().optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    usageLimit: nonNegativeQuantitySchema.nullable().optional(),
    perCustomerLimit: nonNegativeQuantitySchema.nullable().optional(),
  })
  .strict()
  .superRefine((coupon, context) => {
    if (coupon.startsAt && coupon.endsAt && coupon.endsAt <= coupon.startsAt) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "The coupon end date must be after its start date.",
      });
    }
  });

export const applyCouponInputSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{3,40}$/),
  })
  .strict();

export const adminCouponReadSchema = couponDocumentSchema.extend({
  id: documentIdSchema,
});

export const couponRedemptionDocumentSchema = z
  .object({
    couponId: documentIdSchema,
    userId: userIdSchema,
    orderId: documentIdSchema,
    amount: moneySchema,
    schemaVersion: schemaVersionSchema,
    createdAt: firestoreTimestampSchema,
  })
  .strict();

export const returnStatusSchema = z.enum([
  "REQUESTED",
  "APPROVED",
  "REJECTED",
  "RECEIVED",
  "REFUNDED",
  "CLOSED",
]);

export const returnConditionSchema = z.enum([
  "UNINSPECTED",
  "RESELLABLE",
  "DAMAGED",
]);

export const returnPolicySchema = z
  .object({
    version: z.string().trim().min(3).max(80).default("returns-14-days-v1"),
    windowDays: z.number().int().min(0).max(365).default(14),
    eligibleStatuses: z
      .array(orderStatusSchema)
      .min(1)
      .max(20)
      .default(["DELIVERED"]),
    reasons: z
      .array(z.string().trim().min(3).max(80))
      .min(1)
      .max(20)
      .default(["Wrong size", "Damaged item", "Changed mind"]),
    restockingFee: moneySchema.default({ amountMinor: 0, currency: "PKR" }),
    restoreResellableStock: z.boolean().default(true),
  })
  .strict();

export const returnItemSchema = z
  .object({
    orderItemId: documentIdSchema,
    productId: documentIdSchema,
    variantId: documentIdSchema,
    sku: skuSchema,
    quantity: quantitySchema,
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const returnDocumentSchema = z
  .object({
    orderId: documentIdSchema,
    userId: userIdSchema,
    items: z.array(returnItemSchema).min(1).max(50),
    status: returnStatusSchema,
    evidencePaths: z.array(z.string().trim().min(1).max(500)).max(8),
    customerNote: z.string().trim().min(1).max(1_000).nullable(),
    staffNote: z.string().trim().min(1).max(1_000).nullable(),
    refundPaymentId: documentIdSchema.nullable(),
    refundId: documentIdSchema.nullable().default(null),
    refundAmount: moneySchema.nullable().default(null),
    policyVersion: z
      .string()
      .trim()
      .min(3)
      .max(80)
      .default("returns-14-days-v1"),
    restockingFee: moneySchema.default({ amountMinor: 0, currency: "PKR" }),
    restoreResellableStock: z.boolean().default(true),
    returnWindowEndsAt: firestoreTimestampSchema.nullable().default(null),
    condition: returnConditionSchema.default("UNINSPECTED"),
    requestedAt: firestoreTimestampSchema,
    approvedAt: firestoreTimestampSchema.nullable().default(null),
    rejectedAt: firestoreTimestampSchema.nullable().default(null),
    receivedAt: firestoreTimestampSchema.nullable(),
    refundedAt: firestoreTimestampSchema.nullable().default(null),
    archivedAt: archivedAtSchema,
    ...schemaMetadata,
  })
  .strict();

export const createReturnInputSchema = z
  .object({
    orderId: documentIdSchema,
    items: z
      .array(
        z
          .object({
            orderItemId: documentIdSchema,
            quantity: quantitySchema,
            reason: z.string().trim().min(3).max(500),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    evidencePaths: z
      .array(z.string().trim().min(1).max(500))
      .max(8)
      .default([]),
    customerNote: z.string().trim().min(1).max(1_000).nullable().default(null),
  })
  .strict();

export const customerReturnReadSchema = z
  .object({
    id: documentIdSchema,
    orderId: documentIdSchema,
    items: z.array(returnItemSchema).min(1).max(50),
    status: returnStatusSchema,
    evidencePaths: z.array(z.string().trim().min(1).max(500)).max(8),
    customerNote: z.string().trim().min(1).max(1_000).nullable(),
    policyVersion: z
      .string()
      .trim()
      .min(3)
      .max(80)
      .default("returns-14-days-v1"),
    returnWindowEndsAt: firestoreTimestampSchema.nullable().default(null),
    refundAmount: moneySchema.nullable().default(null),
    requestedAt: firestoreTimestampSchema,
  })
  .strict();

export const adminReturnReadSchema = returnDocumentSchema.extend({
  id: documentIdSchema,
});

export const emailTemplateKeySchema = z.enum([
  "WELCOME",
  "EMAIL_VERIFICATION",
  "PASSWORD_RESET",
  "ORDER_PLACED",
  "PAYMENT_RECEIVED",
  "PAYMENT_FAILED",
  "ORDER_SHIPPED",
  "ORDER_DELIVERED",
  "ORDER_CANCELLED",
  "RETURN_REQUESTED",
  "RETURN_UPDATED",
  "REFUND_INITIATED",
  "REFUND_COMPLETED",
  "REFUND_FAILED",
]);

export const emailDeliveryStatusSchema = z.enum([
  "PENDING",
  "SENT",
  "FAILED",
  "SKIPPED",
]);

export const emailDeliveryDocumentSchema = z
  .object({
    idempotencyKey: z
      .string()
      .trim()
      .min(8)
      .max(255)
      .regex(/^[A-Za-z0-9:_-]+$/),
    template: emailTemplateKeySchema,
    to: z
      .object({
        email: emailSchema,
        name: customerNameSchema.nullable(),
      })
      .strict(),
    from: z
      .object({
        email: emailSchema,
        name: shortTextSchema,
      })
      .strict(),
    userId: userIdSchema.nullable(),
    source: z
      .object({
        type: z.enum(["AUTH", "ORDER", "PAYMENT", "RETURN", "REFUND"]),
        id: documentIdSchema,
      })
      .strict(),
    subject: z.string().trim().min(3).max(180),
    previewText: z.string().trim().min(3).max(240),
    textBody: z.string().trim().min(10).max(12_000),
    htmlBody: z.string().trim().min(10).max(24_000),
    status: emailDeliveryStatusSchema,
    provider: z.string().trim().min(2).max(40),
    providerMessageId: z.string().trim().min(1).max(255).nullable(),
    attempts: z.number().int().min(0).max(10),
    lastError: z.string().trim().min(1).max(500).nullable(),
    nextAttemptAt: firestoreTimestampSchema.nullable(),
    sentAt: firestoreTimestampSchema.nullable(),
    ...schemaMetadata,
  })
  .strict();

export const notificationTypeSchema = z.enum([
  "ACCOUNT",
  "ORDER",
  "PAYMENT",
  "RETURN",
  "SUPPORT",
  "PROMOTION",
  "SYSTEM",
]);

const notificationPayloadValueSchema = z.union([
  z.string().max(500),
  z.number().finite(),
  z.boolean(),
]);

export const notificationDocumentSchema = z
  .object({
    type: notificationTypeSchema,
    title: z.string().trim().min(3).max(120),
    body: z.string().trim().min(3).max(500),
    payload: z.record(
      z.string().trim().min(1).max(40),
      notificationPayloadValueSchema,
    ),
    readAt: firestoreTimestampSchema.nullable(),
    expiresAt: firestoreTimestampSchema.nullable(),
    ...schemaMetadata,
  })
  .strict();

export const updateNotificationReadStateInputSchema = z
  .object({
    read: z.boolean(),
  })
  .strict();

export const customerNotificationReadSchema = notificationDocumentSchema.extend(
  {
    id: documentIdSchema,
  },
);

export const supportTicketStatusSchema = z.enum([
  "OPEN",
  "IN_PROGRESS",
  "WAITING_ON_CUSTOMER",
  "RESOLVED",
  "CLOSED",
]);

export const supportTicketDocumentSchema = z
  .object({
    userId: userIdSchema,
    subject: z.string().trim().min(5).max(160),
    initialMessage: z.string().trim().min(10).max(4_000),
    status: supportTicketStatusSchema,
    assignedStaffId: userIdSchema.nullable(),
    relatedOrderId: documentIdSchema.nullable(),
    archivedAt: archivedAtSchema,
    ...schemaMetadata,
  })
  .strict();

export const createSupportTicketInputSchema = z
  .object({
    subject: z.string().trim().min(5).max(160),
    message: z.string().trim().min(10).max(4_000),
    relatedOrderId: documentIdSchema.nullable().default(null),
  })
  .strict();

export const updateSupportTicketInputSchema = z
  .object({
    message: z.string().trim().min(1).max(4_000).optional(),
  })
  .strict();

export const supportTicketMessageDocumentSchema = z
  .object({
    authorId: userIdSchema,
    authorRole: z.enum(["CUSTOMER", "STAFF", "ADMIN", "SUPER_ADMIN"]),
    body: z.string().trim().min(1).max(4_000),
    ...schemaMetadata,
  })
  .strict();

export const customerActivityTypeSchema = z.enum([
  "ACCOUNT_CREATED",
  "PRODUCT_VIEWED",
  "SEARCHED",
  "WISHLIST_CHANGED",
  "CART_CHANGED",
  "CHECKOUT_STARTED",
  "ORDER_PLACED",
  "SUPPORT_TICKET_CREATED",
]);

export const customerActivityDocumentSchema = z
  .object({
    userId: userIdSchema,
    type: customerActivityTypeSchema,
    context: z.record(z.string().trim().min(1).max(40), z.string().max(200)),
    expiresAt: firestoreTimestampSchema,
    ...schemaMetadata,
  })
  .strict();

export const customerSegmentSchema = z.enum([
  "NEW",
  "ACTIVE",
  "RETURNING",
  "INACTIVE",
  "DISABLED",
]);

export const customerSupportTicketReadSchema = z
  .object({
    id: documentIdSchema,
    subject: z.string().trim().min(5).max(160),
    initialMessage: z.string().trim().min(10).max(4_000),
    status: supportTicketStatusSchema,
    relatedOrderId: documentIdSchema.nullable(),
    createdAt: firestoreTimestampSchema,
    updatedAt: firestoreTimestampSchema,
  })
  .strict();

export const adminSupportTicketReadSchema = supportTicketDocumentSchema.extend({
  id: documentIdSchema,
});

export const auditActionSchema = z.enum([
  "AUTH",
  "PROFILE",
  "CATALOG",
  "INVENTORY",
  "ORDER",
  "PAYMENT",
  "COUPON",
  "RETURN",
  "SUPPORT",
  "SETTINGS",
]);

const auditMetadataValueSchema = z.union([
  z.string().max(500),
  z.number().finite(),
  z.boolean(),
]);

export const auditLogDocumentSchema = z
  .object({
    action: auditActionSchema,
    actorId: userIdSchema.nullable(),
    targetType: z.string().trim().min(2).max(80),
    targetId: documentIdSchema.nullable(),
    metadata: z.record(
      z.string().trim().min(1).max(40),
      auditMetadataValueSchema,
    ),
    correlationId: z.string().trim().min(8).max(128),
    schemaVersion: schemaVersionSchema,
    createdAt: firestoreTimestampSchema,
  })
  .strict();

export const adminAuditLogReadSchema = auditLogDocumentSchema.extend({
  id: documentIdSchema,
});

export const settingsVisibilitySchema = z.enum(["PUBLIC", "PRIVATE"]);

export const settingsDocumentSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(3)
      .max(100)
      .regex(/^[a-z]+(?:\.[a-z0-9]+)*$/),
    visibility: settingsVisibilitySchema,
    value: z.record(z.string().trim().min(1).max(80), z.unknown()),
    revision: z.number().int().min(1).max(999_999).default(1),
    ...schemaMetadata,
  })
  .strict();

export const updateSettingsInputSchema = z
  .object({
    value: z.record(z.string().trim().min(1).max(80), z.unknown()),
  })
  .strict();

export const publicSettingsReadSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(3)
      .max(100)
      .regex(/^[a-z]+(?:\.[a-z0-9]+)*$/),
    visibility: z.literal("PUBLIC"),
    value: z.record(z.string().trim().min(1).max(80), z.unknown()),
  })
  .strict();

export const adminSettingsReadSchema = settingsDocumentSchema;

export const skuRegistryDocumentSchema = z
  .object({
    sku: skuSchema,
    productId: documentIdSchema,
    variantId: documentIdSchema,
    schemaVersion: schemaVersionSchema,
    createdAt: firestoreTimestampSchema,
  })
  .strict();

export const slugRegistryDocumentSchema = z
  .object({
    type: z.enum(["PRODUCT", "CATEGORY"]),
    slug: slugSchema,
    entityId: documentIdSchema,
    schemaVersion: schemaVersionSchema,
    createdAt: firestoreTimestampSchema,
  })
  .strict();

export type UserDocument = z.infer<typeof userDocumentSchema>;
export type ProductDocument = z.infer<typeof productDocumentSchema>;
export type ProductVariantDocument = z.infer<
  typeof productVariantDocumentSchema
>;
export type CategoryDocument = z.infer<typeof categoryDocumentSchema>;
export type InventoryDocument = z.infer<typeof inventoryDocumentSchema>;
export type InventoryTransactionDocument = z.infer<
  typeof inventoryTransactionDocumentSchema
>;
export type CartDocument = z.infer<typeof cartDocumentSchema>;
export type CartItemDocument = z.infer<typeof cartItemDocumentSchema>;
export type CustomerAddressDocument = z.infer<
  typeof customerAddressDocumentSchema
>;
export type WishlistItemDocument = z.infer<typeof wishlistItemDocumentSchema>;
export type OrderDocument = z.infer<typeof orderDocumentSchema>;
export type PaymentDocument = z.infer<typeof paymentDocumentSchema>;
export type RefundDocument = z.infer<typeof refundDocumentSchema>;
export type ReviewDocument = z.infer<typeof reviewDocumentSchema>;
export type CouponDocument = z.infer<typeof couponDocumentSchema>;
export type ReturnPolicy = z.infer<typeof returnPolicySchema>;
export type ReturnDocument = z.infer<typeof returnDocumentSchema>;
export type EmailDeliveryDocument = z.infer<typeof emailDeliveryDocumentSchema>;
export type NotificationDocument = z.infer<typeof notificationDocumentSchema>;
export type SupportTicketDocument = z.infer<typeof supportTicketDocumentSchema>;
export type CustomerSegment = z.infer<typeof customerSegmentSchema>;
export type AuditLogDocument = z.infer<typeof auditLogDocumentSchema>;
export type SettingsDocument = z.infer<typeof settingsDocumentSchema>;
