import "server-only";

import {
  adminAuditLogReadSchema,
  adminCouponReadSchema,
  adminOrderReadSchema,
  adminPaymentReadSchema,
  adminReviewReadSchema,
  adminReturnReadSchema,
  adminSettingsReadSchema,
  inventoryDocumentSchema,
  productDocumentSchema,
  userDocumentSchema,
  type AdminPermission,
  type UserRole,
  type CustomerSegment,
} from "@bazm/domain";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { cache } from "react";

import { getServerFirestore } from "@/lib/firebase/admin";

const PAGE_SIZE = 25;
export const ADMIN_TIME_ZONE = "Asia/Karachi";
export const ADMIN_CURRENCY = "PKR";

type PageInput = {
  after?: string;
  q?: string;
  status?: string;
  role?: string;
  state?: string;
  action?: string;
};

function iso(value: Date | { toDate: () => Date }) {
  return (value instanceof Date ? value : value.toDate()).toISOString();
}

function formatDateKey(value: Date | { toDate: () => Date }) {
  const date = value instanceof Date ? value : value.toDate();
  const parts = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "2-digit",
    timeZone: ADMIN_TIME_ZONE,
    year: "numeric",
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((accumulator, part) => {
      accumulator[part.type] = part.value;
      return accumulator;
    }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function searchable(...values: (string | number | null | undefined)[]) {
  return values.join(" ").toLowerCase();
}

function matchesQuery(query: string | undefined, haystack: string) {
  const normalized = query?.trim().toLowerCase();
  return !normalized || haystack.includes(normalized);
}

async function page(collection: string, sortField: string, after?: string) {
  const firestore = getServerFirestore();
  let query = firestore.collection(collection).orderBy(sortField, "desc");
  if (after) {
    const cursor = await firestore.collection(collection).doc(after).get();
    if (cursor.exists) query = query.startAfter(cursor);
  }
  const snapshot = await query.limit(PAGE_SIZE + 1).get();
  const documents = snapshot.docs.slice(0, PAGE_SIZE);
  return {
    documents,
    nextCursor:
      snapshot.docs.length > PAGE_SIZE ? (documents.at(-1)?.id ?? null) : null,
  };
}

function moneyMinor(value: { amountMinor: number }) {
  return value.amountMinor;
}

export type AdminOrderRow = {
  id: string;
  userId: string;
  status: string;
  totalMinor: number;
  paymentMethod: string;
  deliveryMethod: string;
  itemCount: number;
  trackingNumber: string | null;
  placedAt: string;
};

export const listAdminOrders = cache(async (input: PageInput = {}) => {
  const { documents, nextCursor } = await page(
    "orders",
    "placedAt",
    input.after,
  );
  const items = documents
    .map((document) =>
      adminOrderReadSchema.parse({ id: document.id, ...document.data() }),
    )
    .map<AdminOrderRow>((order) => ({
      id: order.id,
      userId: order.userId,
      status: order.status,
      totalMinor: order.totals.grandTotal.amountMinor,
      paymentMethod: order.paymentMethod,
      deliveryMethod: order.deliveryMethod,
      itemCount: order.items.reduce((total, item) => total + item.quantity, 0),
      trackingNumber: order.trackingNumber,
      placedAt: iso(order.placedAt),
    }))
    .filter(
      (order) =>
        (!input.status ||
          input.status === "ALL" ||
          order.status === input.status) &&
        matchesQuery(
          input.q,
          searchable(
            order.id,
            order.userId,
            order.status,
            order.paymentMethod,
            order.trackingNumber,
          ),
        ),
    );
  return { items, nextCursor };
});

export type AdminCustomerRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  permissions: AdminPermission[];
  isActive: boolean;
  emailVerified: boolean;
  createdAt: string;
};

export const listAdminCustomers = cache(async (input: PageInput = {}) => {
  const { documents, nextCursor } = await page(
    "users",
    "createdAt",
    input.after,
  );
  const items = documents
    .map((document) => {
      const user = userDocumentSchema.parse(document.data());
      return {
        id: document.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        permissions: user.permissions ?? [],
        isActive: user.isActive,
        emailVerified: user.emailVerified,
        createdAt: iso(user.createdAt),
      };
    })
    .filter((user) => {
      const stateMatches =
        !input.state ||
        input.state === "ALL" ||
        (input.state === "ACTIVE" && user.isActive) ||
        (input.state === "DISABLED" && !user.isActive) ||
        (input.state === "UNVERIFIED" && !user.emailVerified);
      return (
        stateMatches &&
        (!input.role || input.role === "ALL" || user.role === input.role) &&
        matchesQuery(
          input.q,
          searchable(user.id, user.name, user.email, user.phone),
        )
      );
    });
  return { items, nextCursor };
});

export const getCustomer360 = cache(async (userId: string) => {
  const firestore = getServerFirestore();
  const userSnapshot = await firestore.collection("users").doc(userId).get();
  if (!userSnapshot.exists) return null;
  const user = userDocumentSchema.parse(userSnapshot.data());
  const [addresses, orders, wishlist, reviews, activities, tickets] =
    await Promise.all([
      firestore
        .collection("users")
        .doc(userId)
        .collection("addresses")
        .limit(20)
        .get(),
      firestore
        .collection("orders")
        .where("userId", "==", userId)
        .orderBy("placedAt", "desc")
        .limit(25)
        .get(),
      firestore
        .collection("wishlists")
        .doc(userId)
        .collection("items")
        .limit(25)
        .get(),
      firestore
        .collection("reviews")
        .where("userId", "==", userId)
        .orderBy("createdAt", "desc")
        .limit(25)
        .get(),
      firestore
        .collection("customerActivities")
        .where("userId", "==", userId)
        .orderBy("createdAt", "desc")
        .limit(25)
        .get(),
      firestore
        .collection("supportTickets")
        .where("userId", "==", userId)
        .orderBy("updatedAt", "desc")
        .limit(25)
        .get(),
    ]);
  const orderRows = orders.docs.map((document) => ({
    id: document.id,
    status: String(document.get("status")),
    totalMinor: Number(document.get("totals.grandTotal.amountMinor") ?? 0),
    placedAt: iso(document.get("placedAt")),
  }));
  const paidStatuses = new Set([
    "CONFIRMED",
    "PROCESSING",
    "SHIPPED",
    "DELIVERED",
  ]);
  const completed = orderRows.filter((order) => paidStatuses.has(order.status));
  const spendMinor = completed.reduce(
    (total, order) => total + order.totalMinor,
    0,
  );
  const createdDate =
    user.createdAt instanceof Date ? user.createdAt : user.createdAt.toDate();
  const ageDays = Math.floor((Date.now() - createdDate.getTime()) / 86_400_000);
  const latestOrderDays = completed[0]
    ? Math.floor(
        (Date.now() - new Date(completed[0].placedAt).getTime()) / 86_400_000,
      )
    : null;
  let segment: CustomerSegment = "INACTIVE";
  if (!user.isActive) segment = "DISABLED";
  else if (ageDays <= 30 && completed.length === 0) segment = "NEW";
  else if (completed.length >= 2) segment = "RETURNING";
  else if (latestOrderDays !== null && latestOrderDays <= 90)
    segment = "ACTIVE";
  return {
    profile: {
      id: userId,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      role: user.role,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      createdAt: iso(user.createdAt),
    },
    segment,
    metrics: {
      orderCount: completed.length,
      spendMinor,
      wishlistCount: wishlist.size,
      reviewCount: reviews.size,
      ticketCount: tickets.size,
    },
    addresses: addresses.docs.map((document) => ({
      id: document.id,
      label: String(document.get("label") ?? "Address"),
      city: String(document.get("city") ?? ""),
      province: String(document.get("province") ?? ""),
    })),
    orders: orderRows,
    activities: activities.docs.map((document) => ({
      id: document.id,
      type: String(document.get("type")),
      createdAt: iso(document.get("createdAt")),
      context: document.get("context") as Record<string, string>,
    })),
    tickets: tickets.docs.map((document) => ({
      id: document.id,
      subject: String(document.get("subject")),
      status: String(document.get("status")),
      updatedAt: iso(document.get("updatedAt")),
    })),
  };
});

export const listSupportTickets = cache(async (input: PageInput = {}) => {
  const { documents, nextCursor } = await page(
    "supportTickets",
    "updatedAt",
    input.after,
  );
  const items = documents
    .map((document) => ({
      id: document.id,
      userId: String(document.get("userId")),
      subject: String(document.get("subject")),
      status: String(document.get("status")),
      assignedStaffId: document.get("assignedStaffId") as string | null,
      relatedOrderId: document.get("relatedOrderId") as string | null,
      updatedAt: iso(document.get("updatedAt")),
    }))
    .filter(
      (ticket) =>
        (!input.status ||
          input.status === "ALL" ||
          ticket.status === input.status) &&
        matchesQuery(
          input.q,
          searchable(ticket.id, ticket.userId, ticket.subject),
        ),
    );
  return { items, nextCursor };
});

export type AdminPaymentRow = {
  id: string;
  orderId: string;
  userId: string;
  provider: string;
  providerPaymentId: string | null;
  amountMinor: number;
  refundedMinor: number;
  status: string;
  failureCode: string | null;
  paidAt: string | null;
  createdAt: string;
};

export const listAdminPayments = cache(async (input: PageInput = {}) => {
  const { documents, nextCursor } = await page(
    "payments",
    "createdAt",
    input.after,
  );
  const items = documents
    .map((document) =>
      adminPaymentReadSchema.parse({ id: document.id, ...document.data() }),
    )
    .map<AdminPaymentRow>((payment) => ({
      id: payment.id,
      orderId: payment.orderId,
      userId: payment.userId,
      provider: payment.provider,
      providerPaymentId: payment.providerPaymentId,
      amountMinor: payment.amount.amountMinor,
      refundedMinor: payment.refundedAmount.amountMinor,
      status: payment.status,
      failureCode: payment.failureCode,
      paidAt: payment.paidAt ? iso(payment.paidAt) : null,
      createdAt: iso(payment.createdAt),
    }))
    .filter(
      (payment) =>
        (!input.status ||
          input.status === "ALL" ||
          payment.status === input.status) &&
        matchesQuery(
          input.q,
          searchable(
            payment.id,
            payment.orderId,
            payment.userId,
            payment.provider,
            payment.providerPaymentId,
            payment.failureCode,
          ),
        ),
    );
  return { items, nextCursor };
});

export const listAdminCoupons = cache(async (input: PageInput = {}) => {
  const { documents, nextCursor } = await page(
    "coupons",
    "updatedAt",
    input.after,
  );
  const items = documents
    .map((document) =>
      adminCouponReadSchema.parse({ id: document.id, ...document.data() }),
    )
    .map((coupon) => ({
      id: coupon.id,
      displayCode: coupon.displayCode,
      discount: coupon.discount,
      minimumOrderAmount: coupon.minimumOrderAmount,
      maximumDiscountAmount: coupon.maximumDiscountAmount,
      startsAt: iso(coupon.startsAt),
      endsAt: iso(coupon.endsAt),
      usageLimit: coupon.usageLimit,
      perCustomerLimit: coupon.perCustomerLimit,
      redemptionCount: coupon.redemptionCount,
      status: coupon.status,
    }))
    .filter(
      (coupon) =>
        (!input.status ||
          input.status === "ALL" ||
          coupon.status === input.status) &&
        matchesQuery(
          input.q,
          searchable(coupon.id, coupon.displayCode, coupon.status),
        ),
    );
  return { items, nextCursor };
});

export const listAdminReviews = cache(async (input: PageInput = {}) => {
  const { documents, nextCursor } = await page(
    "reviews",
    "createdAt",
    input.after,
  );
  const items = documents
    .flatMap((document) => {
      const parsed = adminReviewReadSchema.safeParse({
        id: document.id,
        ...document.data(),
      });
      return parsed.success ? [parsed.data] : [];
    })
    .map((review) => ({
      id: review.id,
      productId: review.productId,
      orderId: review.orderId,
      userId: review.userId,
      rating: review.rating,
      title: review.title,
      content: review.content,
      status: review.status,
      verifiedPurchase: review.verifiedPurchase,
      moderationReason: review.moderationReason,
      reportedCount: review.reportedCount,
      createdAt: iso(review.createdAt),
    }))
    .filter(
      (review) =>
        (!input.status ||
          input.status === "ALL" ||
          review.status === input.status) &&
        matchesQuery(
          input.q,
          searchable(
            review.id,
            review.productId,
            review.orderId,
            review.userId,
            review.title,
            review.content,
          ),
        ),
    );
  return { items, nextCursor };
});

export const listAdminReturns = cache(async (input: PageInput = {}) => {
  const { documents, nextCursor } = await page(
    "returns",
    "requestedAt",
    input.after,
  );
  const items = documents
    .map((document) =>
      adminReturnReadSchema.parse({ id: document.id, ...document.data() }),
    )
    .map((returnRequest) => ({
      id: returnRequest.id,
      orderId: returnRequest.orderId,
      userId: returnRequest.userId,
      status: returnRequest.status,
      items: returnRequest.items,
      evidenceCount: returnRequest.evidencePaths.length,
      customerNote: returnRequest.customerNote,
      staffNote: returnRequest.staffNote,
      refundPaymentId: returnRequest.refundPaymentId,
      refundId: returnRequest.refundId,
      refundAmount: returnRequest.refundAmount,
      policyVersion: returnRequest.policyVersion,
      condition: returnRequest.condition,
      requestedAt: iso(returnRequest.requestedAt),
    }))
    .filter(
      (returnRequest) =>
        (!input.status ||
          input.status === "ALL" ||
          returnRequest.status === input.status) &&
        matchesQuery(
          input.q,
          searchable(
            returnRequest.id,
            returnRequest.orderId,
            returnRequest.userId,
          ),
        ),
    );
  return { items, nextCursor };
});

export const listAdminSettings = cache(async (input: PageInput = {}) => {
  const { documents, nextCursor } = await page(
    "settings",
    "updatedAt",
    input.after,
  );
  const items = documents
    .map((document) => adminSettingsReadSchema.parse(document.data()))
    .map((settings) => ({
      key: settings.key,
      visibility: settings.visibility,
      valueJson: JSON.stringify(settings.value, null, 2),
      revision: settings.revision,
      updatedAt: iso(settings.updatedAt),
    }))
    .filter((settings) =>
      matchesQuery(
        input.q,
        searchable(settings.key, settings.visibility, settings.valueJson),
      ),
    );
  return { items, nextCursor };
});

export const listAdminAuditLogs = cache(async (input: PageInput = {}) => {
  const { documents, nextCursor } = await page(
    "auditLogs",
    "createdAt",
    input.after,
  );
  const items = documents
    .map((document) =>
      adminAuditLogReadSchema.parse({ id: document.id, ...document.data() }),
    )
    .map((entry) => ({
      id: entry.id,
      action: entry.action,
      actorId: entry.actorId,
      targetType: entry.targetType,
      targetId: entry.targetId,
      metadata: entry.metadata,
      correlationId: entry.correlationId,
      createdAt: iso(entry.createdAt),
    }))
    .filter(
      (entry) =>
        (!input.action ||
          input.action === "ALL" ||
          entry.action === input.action) &&
        matchesQuery(
          input.q,
          searchable(
            entry.id,
            entry.action,
            entry.actorId,
            entry.targetType,
            entry.targetId,
            entry.correlationId,
            JSON.stringify(entry.metadata),
          ),
        ),
    );
  return { items, nextCursor };
});

async function recentDocuments(
  collection: string,
  sortField: string,
  limit = 100,
) {
  return (
    await getServerFirestore()
      .collection(collection)
      .orderBy(sortField, "desc")
      .limit(limit)
      .get()
  ).docs;
}

function countBy<T extends string>(values: T[]) {
  return values.reduce<Record<T, number>>(
    (accumulator, value) => ({
      ...accumulator,
      [value]: (accumulator[value] ?? 0) + 1,
    }),
    {} as Record<T, number>,
  );
}

function lastSevenDayBuckets() {
  const today = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    const key = formatDateKey(date);
    return { key, label: key.slice(5), value: 0 };
  });
}

function netPaymentRevenueMinor(
  payment: ReturnType<typeof adminPaymentReadSchema.parse>,
) {
  if (!["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(payment.status)) {
    return 0;
  }
  return Math.max(
    0,
    moneyMinor(payment.amount) - moneyMinor(payment.refundedAmount),
  );
}

export const getAdminDashboardMetrics = cache(async () => {
  const [
    orderDocs,
    paymentDocs,
    userDocs,
    productDocs,
    inventoryDocs,
    returnDocs,
  ] = await Promise.all([
    recentDocuments("orders", "placedAt"),
    recentDocuments("payments", "createdAt"),
    recentDocuments("users", "createdAt"),
    recentDocuments("products", "updatedAt"),
    recentDocuments("inventory", "updatedAt"),
    recentDocuments("returns", "requestedAt"),
  ]);

  const orders = orderDocs.map((document) =>
    adminOrderReadSchema.parse({ id: document.id, ...document.data() }),
  );
  const payments = paymentDocs.map((document) =>
    adminPaymentReadSchema.parse({ id: document.id, ...document.data() }),
  );
  const users = userDocs.map((document) =>
    userDocumentSchema.parse(document.data()),
  );
  const products = productDocs.map((document) =>
    productDocumentSchema.parse(document.data()),
  );
  const inventory = inventoryDocs.map((document) =>
    inventoryDocumentSchema.parse(document.data()),
  );
  const returns = returnDocs.map((document) =>
    adminReturnReadSchema.parse({ id: document.id, ...document.data() }),
  );

  const paidRevenueMinor = payments.reduce(
    (total, payment) => total + netPaymentRevenueMinor(payment),
    0,
  );
  const revenueBuckets = lastSevenDayBuckets();
  const orderBuckets = lastSevenDayBuckets();
  for (const payment of payments) {
    const day = formatDateKey(payment.paidAt ?? payment.createdAt);
    const bucket = revenueBuckets.find((item) => item.key === day);
    if (bucket) bucket.value += netPaymentRevenueMinor(payment);
  }
  for (const order of orders) {
    const day = formatDateKey(order.placedAt);
    const bucket = orderBuckets.find((item) => item.key === day);
    if (bucket) bucket.value += 1;
  }

  const lowStock = inventory.filter(
    (item) => item.available > 0 && item.available <= item.reorderPoint,
  );
  const outOfStock = inventory.filter((item) => item.available === 0);
  const pendingReturns = returns.filter((item) =>
    ["REQUESTED", "APPROVED", "RECEIVED"].includes(item.status),
  );

  return {
    generatedAt: new Date().toISOString(),
    currency: ADMIN_CURRENCY,
    timeZone: ADMIN_TIME_ZONE,
    cards: [
      {
        label: "Net revenue",
        valueMinor: paidRevenueMinor,
        helper: `${payments.length} recent payment records`,
      },
      {
        label: "Orders",
        value: orders.length,
        helper: `${orders.filter((order) => order.status === "PENDING_PAYMENT").length} pending payment`,
      },
      {
        label: "Customers",
        value: users.filter((user) => user.role === "CUSTOMER").length,
        helper: `${users.filter((user) => !user.emailVerified).length} unverified`,
      },
      {
        label: "Products",
        value: products.length,
        helper: `${products.filter((product) => product.status === "PUBLISHED").length} published`,
      },
      {
        label: "Stock alerts",
        value: lowStock.length + outOfStock.length,
        helper: `${outOfStock.length} out · ${lowStock.length} low`,
      },
      {
        label: "Open returns",
        value: pendingReturns.length,
        helper: `${returns.length} recent return records`,
      },
    ],
    orderStatus: countBy(orders.map((order) => order.status)),
    returnStatus: countBy(returns.map((returnRequest) => returnRequest.status)),
    revenueSeries: revenueBuckets,
    orderSeries: orderBuckets,
    stockAlerts: [...outOfStock, ...lowStock].slice(0, 8).map((item) => ({
      sku: item.sku,
      available: item.available,
      reorderPoint: item.reorderPoint,
    })),
  };
});

export function documentCount(documents: QueryDocumentSnapshot[]) {
  return documents.length;
}
