import "server-only";

import {
  inventoryDocumentSchema,
  inventoryTransactionDocumentSchema,
  productVariantDocumentSchema,
} from "@bazm/domain";
import { cache } from "react";

import { getServerFirestore } from "@/lib/firebase/admin";

export type AdminInventoryItem = {
  sku: string;
  productId: string;
  variantId: string;
  available: number;
  reserved: number;
  sold: number;
  returned: number;
  damaged: number;
  reorderPoint: number;
  updatedAt: string;
};
export type AdminInventoryHistory = {
  id: string;
  sku: string;
  type: string;
  delta: number;
  reason: string;
  actorId: string | null;
  resultingAvailable: number;
  createdAt: string;
};
export type InventoryVariantOption = {
  productId: string;
  variantId: string;
  sku: string;
  label: string;
};

function date(value: Date | { toDate: () => Date }) {
  return (value instanceof Date ? value : value.toDate()).toISOString();
}

export const listAdminInventory = cache(
  async (
    after: string | undefined,
  ): Promise<{
    items: AdminInventoryItem[];
    nextCursor: string | null;
  }> => {
    const firestore = getServerFirestore();
    let query = firestore.collection("inventory").orderBy("updatedAt", "desc");
    if (after) {
      const cursor = await firestore.collection("inventory").doc(after).get();
      if (cursor.exists) query = query.startAfter(cursor);
    }
    const snapshot = await query.limit(26).get();
    const documents = snapshot.docs.slice(0, 25);
    return {
      items: documents.map((document) => {
        const item = inventoryDocumentSchema.parse(document.data());
        return {
          sku: item.sku,
          productId: item.productId,
          variantId: item.variantId,
          available: item.available,
          reserved: item.reserved,
          sold: item.sold,
          returned: item.returned,
          damaged: item.damaged,
          reorderPoint: item.reorderPoint,
          updatedAt: date(item.updatedAt),
        };
      }),
      nextCursor:
        snapshot.docs.length > 25 ? (documents.at(-1)?.id ?? null) : null,
    };
  },
);

export const listInventoryVariants = cache(
  async (): Promise<InventoryVariantOption[]> => {
    const snapshot = await getServerFirestore()
      .collectionGroup("variants")
      .where("isActive", "==", true)
      .limit(100)
      .get();
    return snapshot.docs.map((document) => {
      const variant = productVariantDocumentSchema.parse(document.data());
      return {
        productId: variant.productId,
        variantId: document.id,
        sku: variant.sku,
        label: `${variant.sku} · ${variant.color} / ${variant.size}`,
      };
    });
  },
);

export const listInventoryHistory = cache(
  async (
    sku: string | undefined,
    after: string | undefined,
  ): Promise<{ items: AdminInventoryHistory[]; nextCursor: string | null }> => {
    if (!sku) return { items: [], nextCursor: null };
    const firestore = getServerFirestore();
    let query = firestore
      .collection("inventoryTransactions")
      .where("sku", "==", sku)
      .orderBy("createdAt", "desc");
    if (after) {
      const cursor = await firestore
        .collection("inventoryTransactions")
        .doc(after)
        .get();
      if (cursor.exists) query = query.startAfter(cursor);
    }
    const snapshot = await query.limit(26).get();
    const documents = snapshot.docs.slice(0, 25);
    return {
      items: documents.map((document) => {
        const item = inventoryTransactionDocumentSchema.parse(document.data());
        return {
          id: document.id,
          sku: item.sku,
          type: item.type,
          delta: item.delta,
          reason: item.reason,
          actorId: item.actorId,
          resultingAvailable: item.resultingAvailable,
          createdAt: date(item.createdAt),
        };
      }),
      nextCursor:
        snapshot.docs.length > 25 ? (documents.at(-1)?.id ?? null) : null,
    };
  },
);
