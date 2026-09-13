export type CoreListQueryDefinition = {
  name: string;
  collection: string;
  filters: string[];
  sort: {
    field: string;
    direction: "ASCENDING" | "DESCENDING";
  };
};

/**
 * Every unbounded operational list must use FirestoreRepository.list with one
 * of these bounded filter/sort shapes. The same definitions are checked
 * against firebase/firestore.indexes.json in the Phase 3 test suite.
 */
export const coreListQueryDefinitions = [
  {
    name: "all-orders-for-customer",
    collection: "orders",
    filters: ["userId"],
    sort: { field: "placedAt", direction: "DESCENDING" },
  },
  {
    name: "all-support-tickets-for-customer",
    collection: "supportTickets",
    filters: ["userId"],
    sort: { field: "updatedAt", direction: "DESCENDING" },
  },
  {
    name: "active-users-by-role",
    collection: "users",
    filters: ["isActive", "role"],
    sort: { field: "createdAt", direction: "DESCENDING" },
  },
  {
    name: "published-products-by-category-and-price",
    collection: "products",
    filters: ["status", "categoryId"],
    sort: { field: "basePrice.amountMinor", direction: "ASCENDING" },
  },
  {
    name: "featured-published-products",
    collection: "products",
    filters: ["status", "flags.featured"],
    sort: { field: "createdAt", direction: "DESCENDING" },
  },
  {
    name: "new-arrival-published-products",
    collection: "products",
    filters: ["status", "flags.newArrival"],
    sort: { field: "createdAt", direction: "DESCENDING" },
  },
  {
    name: "published-products-by-price-ascending",
    collection: "products",
    filters: ["status"],
    sort: { field: "basePrice.amountMinor", direction: "ASCENDING" },
  },
  {
    name: "published-products-by-price-descending",
    collection: "products",
    filters: ["status"],
    sort: { field: "basePrice.amountMinor", direction: "DESCENDING" },
  },
  {
    name: "published-products-by-newest",
    collection: "products",
    filters: ["status"],
    sort: { field: "createdAt", direction: "DESCENDING" },
  },
  {
    name: "active-category-children",
    collection: "categories",
    filters: ["status", "parentId"],
    sort: { field: "sortOrder", direction: "ASCENDING" },
  },
  {
    name: "all-active-categories",
    collection: "categories",
    filters: ["status"],
    sort: { field: "sortOrder", direction: "ASCENDING" },
  },
  {
    name: "inventory-ledger-by-sku",
    collection: "inventoryTransactions",
    filters: ["sku"],
    sort: { field: "createdAt", direction: "DESCENDING" },
  },
  {
    name: "active-inventory-reservations-by-expiry",
    collection: "inventoryReservations",
    filters: ["status"],
    sort: { field: "reservedUntil", direction: "ASCENDING" },
  },
  {
    name: "orders-for-customer",
    collection: "orders",
    filters: ["userId", "status"],
    sort: { field: "placedAt", direction: "DESCENDING" },
  },
  {
    name: "orders-by-status",
    collection: "orders",
    filters: ["status"],
    sort: { field: "placedAt", direction: "DESCENDING" },
  },
  {
    name: "payments-for-customer",
    collection: "payments",
    filters: ["userId", "status"],
    sort: { field: "createdAt", direction: "DESCENDING" },
  },
  {
    name: "payments-for-order",
    collection: "payments",
    filters: ["orderId"],
    sort: { field: "createdAt", direction: "DESCENDING" },
  },
  {
    name: "published-reviews-for-product",
    collection: "reviews",
    filters: ["productId", "status"],
    sort: { field: "createdAt", direction: "DESCENDING" },
  },
  {
    name: "reviews-for-customer",
    collection: "reviews",
    filters: ["userId"],
    sort: { field: "createdAt", direction: "DESCENDING" },
  },
  {
    name: "active-coupons-by-expiry",
    collection: "coupons",
    filters: ["status"],
    sort: { field: "endsAt", direction: "ASCENDING" },
  },
  {
    name: "returns-for-customer",
    collection: "returns",
    filters: ["userId", "status"],
    sort: { field: "requestedAt", direction: "DESCENDING" },
  },
  {
    name: "returns-by-status",
    collection: "returns",
    filters: ["status"],
    sort: { field: "requestedAt", direction: "DESCENDING" },
  },
  {
    name: "support-tickets-for-customer",
    collection: "supportTickets",
    filters: ["userId", "status"],
    sort: { field: "updatedAt", direction: "DESCENDING" },
  },
  {
    name: "support-tickets-by-status",
    collection: "supportTickets",
    filters: ["status"],
    sort: { field: "updatedAt", direction: "DESCENDING" },
  },
  {
    name: "audit-logs-by-action",
    collection: "auditLogs",
    filters: ["action"],
    sort: { field: "createdAt", direction: "DESCENDING" },
  },
  {
    name: "customer-activities-for-customer",
    collection: "customerActivities",
    filters: ["userId"],
    sort: { field: "createdAt", direction: "DESCENDING" },
  },
] as const satisfies readonly CoreListQueryDefinition[];
