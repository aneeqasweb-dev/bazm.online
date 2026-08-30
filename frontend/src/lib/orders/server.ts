import "server-only";

import {
  customerAddressDocumentSchema,
  orderDocumentSchema,
  returnDocumentSchema,
} from "@bazm/domain";
import { cache } from "react";

import { getServerFirestore } from "@/lib/firebase/admin";

function iso(value: Date | { toDate: () => Date }) {
  return (value instanceof Date ? value : value.toDate()).toISOString();
}

export const listCheckoutAddresses = cache(async (userId: string) => {
  const snapshot = await getServerFirestore()
    .collection("users")
    .doc(userId)
    .collection("addresses")
    .orderBy("updatedAt", "desc")
    .limit(20)
    .get();
  return snapshot.docs.map((document) => {
    const address = customerAddressDocumentSchema.parse(document.data());
    return {
      id: document.id,
      label: address.label,
      recipientName: address.recipientName,
      line1: address.line1,
      area: address.area,
      city: address.city,
      province: address.province,
      postalCode: address.postalCode,
    };
  });
});

export const listCustomerOrders = cache(async (userId: string) => {
  const firestore = getServerFirestore();
  const [snapshot, returnsSnapshot] = await Promise.all([
    firestore
      .collection("orders")
      .where("userId", "==", userId)
      .orderBy("placedAt", "desc")
      .limit(25)
      .get(),
    firestore
      .collection("returns")
      .where("userId", "==", userId)
      .limit(100)
      .get(),
  ]);
  const returnsByOrder = new Map<
    string,
    (ReturnType<typeof returnDocumentSchema.parse> & { id: string })[]
  >();
  for (const document of returnsSnapshot.docs) {
    const returnRequest = {
      id: document.id,
      ...returnDocumentSchema.parse(document.data()),
    };
    const existing = returnsByOrder.get(returnRequest.orderId) ?? [];
    existing.push(returnRequest);
    returnsByOrder.set(returnRequest.orderId, existing);
  }
  return snapshot.docs.map((document) => {
    const order = orderDocumentSchema.parse(document.data());
    return {
      id: document.id,
      status: order.status,
      items: order.items,
      totals: order.totals,
      trackingNumber: order.trackingNumber,
      placedAt: iso(order.placedAt),
      returns: (returnsByOrder.get(document.id) ?? []).map((returnRequest) => ({
        id: returnRequest.id,
        status: returnRequest.status,
        items: returnRequest.items,
        customerNote: returnRequest.customerNote,
        policyVersion: returnRequest.policyVersion,
        refundAmount: returnRequest.refundAmount,
        requestedAt: iso(returnRequest.requestedAt),
      })),
    };
  });
});
