import {
  auditLogDocumentSchema,
  cartDocumentSchema,
  cartItemDocumentSchema,
  categoryDocumentSchema,
  couponDocumentSchema,
  inventoryDocumentSchema,
  inventoryTransactionDocumentSchema,
  notificationDocumentSchema,
  orderDocumentSchema,
  paymentDocumentSchema,
  productDocumentSchema,
  reviewDocumentSchema,
  returnDocumentSchema,
  settingsDocumentSchema,
  supportTicketDocumentSchema,
  userDocumentSchema,
  wishlistItemDocumentSchema,
  type AuditLogDocument,
  type CartDocument,
  type CartItemDocument,
  type CategoryDocument,
  type CouponDocument,
  type InventoryDocument,
  type InventoryTransactionDocument,
  type NotificationDocument,
  type OrderDocument,
  type PaymentDocument,
  type ProductDocument,
  type ReviewDocument,
  type ReturnDocument,
  type SettingsDocument,
  type SupportTicketDocument,
  type UserDocument,
  type WishlistItemDocument,
} from "@bazm/domain";
import type { Firestore } from "firebase-admin/firestore";

import { FirestoreRepository } from "./repository.js";

const mutable = { timestamps: "mutable" as const };
const immutable = { timestamps: "immutable" as const };

export type CoreRepositories = {
  users: FirestoreRepository<UserDocument>;
  products: FirestoreRepository<ProductDocument>;
  categories: FirestoreRepository<CategoryDocument>;
  inventory: FirestoreRepository<InventoryDocument>;
  inventoryTransactions: FirestoreRepository<InventoryTransactionDocument>;
  carts: FirestoreRepository<CartDocument>;
  cartItems: (userId: string) => FirestoreRepository<CartItemDocument>;
  wishlistItems: (userId: string) => FirestoreRepository<WishlistItemDocument>;
  orders: FirestoreRepository<OrderDocument>;
  payments: FirestoreRepository<PaymentDocument>;
  reviews: FirestoreRepository<ReviewDocument>;
  coupons: FirestoreRepository<CouponDocument>;
  returns: FirestoreRepository<ReturnDocument>;
  notificationItems: (
    userId: string,
  ) => FirestoreRepository<NotificationDocument>;
  supportTickets: FirestoreRepository<SupportTicketDocument>;
  auditLogs: FirestoreRepository<AuditLogDocument>;
  settings: FirestoreRepository<SettingsDocument>;
};

export function createCoreRepositories(firestore: Firestore): CoreRepositories {
  return {
    users: new FirestoreRepository(firestore, userDocumentSchema, {
      collectionPath: "users",
      ...mutable,
    }),
    products: new FirestoreRepository(firestore, productDocumentSchema, {
      collectionPath: "products",
      ...mutable,
    }),
    categories: new FirestoreRepository(firestore, categoryDocumentSchema, {
      collectionPath: "categories",
      ...mutable,
    }),
    inventory: new FirestoreRepository(firestore, inventoryDocumentSchema, {
      collectionPath: "inventory",
      ...mutable,
    }),
    inventoryTransactions: new FirestoreRepository(
      firestore,
      inventoryTransactionDocumentSchema,
      { collectionPath: "inventoryTransactions", ...immutable },
    ),
    carts: new FirestoreRepository(firestore, cartDocumentSchema, {
      collectionPath: "carts",
      ...mutable,
    }),
    cartItems: (userId) =>
      new FirestoreRepository(firestore, cartItemDocumentSchema, {
        collectionPath: `carts/${userId}/items`,
        ...mutable,
      }),
    wishlistItems: (userId) =>
      new FirestoreRepository(firestore, wishlistItemDocumentSchema, {
        collectionPath: `wishlists/${userId}/items`,
        ...immutable,
      }),
    orders: new FirestoreRepository(firestore, orderDocumentSchema, {
      collectionPath: "orders",
      ...mutable,
    }),
    payments: new FirestoreRepository(firestore, paymentDocumentSchema, {
      collectionPath: "payments",
      ...mutable,
    }),
    reviews: new FirestoreRepository(firestore, reviewDocumentSchema, {
      collectionPath: "reviews",
      ...mutable,
    }),
    coupons: new FirestoreRepository(firestore, couponDocumentSchema, {
      collectionPath: "coupons",
      ...mutable,
    }),
    returns: new FirestoreRepository(firestore, returnDocumentSchema, {
      collectionPath: "returns",
      ...mutable,
    }),
    notificationItems: (userId) =>
      new FirestoreRepository(firestore, notificationDocumentSchema, {
        collectionPath: `notifications/${userId}/items`,
        ...mutable,
      }),
    supportTickets: new FirestoreRepository(
      firestore,
      supportTicketDocumentSchema,
      {
        collectionPath: "supportTickets",
        ...mutable,
      },
    ),
    auditLogs: new FirestoreRepository(firestore, auditLogDocumentSchema, {
      collectionPath: "auditLogs",
      ...immutable,
    }),
    settings: new FirestoreRepository(firestore, settingsDocumentSchema, {
      collectionPath: "settings",
      ...mutable,
    }),
  };
}
