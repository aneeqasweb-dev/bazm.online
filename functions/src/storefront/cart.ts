import {
  cartItemDocumentSchema,
  documentIdSchema,
  inventoryDocumentSchema,
  productDocumentSchema,
  productVariantDocumentSchema,
  quantitySchema,
} from "@bazm/domain";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";

import { requireActiveUser } from "../auth/admin-permissions.js";
import { getAdminFirestore } from "../lib/firebase-admin.js";

const options = {
  region: "asia-south1",
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true",
};

const addCartItemSchema = z
  .object({
    productId: documentIdSchema,
    variantId: documentIdSchema,
    quantity: quantitySchema,
  })
  .strict();
const updateCartItemSchema = z
  .object({ variantId: documentIdSchema, quantity: quantitySchema })
  .strict();
const removeCartItemSchema = z.object({ variantId: documentIdSchema }).strict();

async function validateLine({
  productId,
  variantId,
  quantity,
}: z.infer<typeof addCartItemSchema>) {
  const database = getAdminFirestore();
  const productRef = database.collection("products").doc(productId);
  const variantRef = productRef.collection("variants").doc(variantId);
  const [productSnapshot, variantSnapshot] = await Promise.all([
    productRef.get(),
    variantRef.get(),
  ]);
  if (!productSnapshot.exists)
    throw new HttpsError("not-found", "This product is no longer available.");
  const product = productDocumentSchema.parse(productSnapshot.data());
  if (product.status !== "PUBLISHED")
    throw new HttpsError("failed-precondition", "This product is unavailable.");
  if (!variantSnapshot.exists)
    throw new HttpsError("not-found", "This option is no longer available.");
  const variant = productVariantDocumentSchema.parse(variantSnapshot.data());
  if (variant.productId !== productId || !variant.isActive)
    throw new HttpsError("failed-precondition", "This option is unavailable.");
  const inventorySnapshot = await database
    .collection("inventory")
    .doc(variant.sku)
    .get();
  if (inventorySnapshot.exists) {
    const inventory = inventoryDocumentSchema.parse(inventorySnapshot.data());
    if (inventory.productId !== productId || inventory.variantId !== variantId)
      throw new HttpsError(
        "failed-precondition",
        "This option cannot be ordered.",
      );
    if (inventory.available === 0)
      throw new HttpsError(
        "failed-precondition",
        "This option is out of stock.",
      );
    if (quantity > inventory.available)
      throw new HttpsError(
        "failed-precondition",
        `Only ${inventory.available} of this option are available.`,
      );
  }
  return {
    product,
    variant,
    snapshot: {
      name: product.name,
      slug: product.slug,
      brand: product.brand,
      image: variant.media[0] ?? product.media[0],
      price: variant.priceOverride ?? product.basePrice,
      sku: variant.sku,
      color: variant.color,
      size: variant.size,
    },
  };
}

export const addCartItem = onCall(options, async (request) => {
  const uid = await requireActiveUser(request);
  const input = addCartItemSchema.safeParse(request.data);
  if (!input.success)
    throw new HttpsError(
      "invalid-argument",
      "Choose a valid quantity and option.",
    );
  const line = await validateLine(input.data);
  const database = getAdminFirestore();
  const cartRef = database.collection("carts").doc(uid);
  const itemRef = cartRef.collection("items").doc(input.data.variantId);
  await database.runTransaction(async (transaction) => {
    const [cart, existing] = await Promise.all([
      transaction.get(cartRef),
      transaction.get(itemRef),
    ]);
    const nextQuantity = existing.exists
      ? quantitySchema.parse(
          (existing.get("requestedQuantity") as number) + input.data.quantity,
        )
      : input.data.quantity;
    if (nextQuantity !== input.data.quantity) {
      await validateLine({ ...input.data, quantity: nextQuantity });
    }
    transaction.set(
      cartRef,
      {
        userId: uid,
        currency: "PKR",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        schemaVersion: 1,
        createdAt: cart.exists
          ? cart.get("createdAt")
          : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    transaction.set(itemRef, {
      productId: input.data.productId,
      variantId: input.data.variantId,
      requestedQuantity: nextQuantity,
      snapshot: existing.exists
        ? cartItemDocumentSchema.parse(existing.data()).snapshot
        : line.snapshot,
      schemaVersion: 1,
      createdAt: existing.exists
        ? existing.get("createdAt")
        : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { ok: true as const };
});

export const updateCartItem = onCall(options, async (request) => {
  const uid = await requireActiveUser(request);
  const input = updateCartItemSchema.safeParse(request.data);
  if (!input.success)
    throw new HttpsError("invalid-argument", "Choose a valid quantity.");
  const database = getAdminFirestore();
  const itemRef = database
    .collection("carts")
    .doc(uid)
    .collection("items")
    .doc(input.data.variantId);
  const item = await itemRef.get();
  if (!item.exists)
    throw new HttpsError("not-found", "This cart item no longer exists.");
  const parsed = cartItemDocumentSchema.parse(item.data());
  await validateLine({
    productId: parsed.productId,
    variantId: parsed.variantId,
    quantity: input.data.quantity,
  });
  await itemRef.update({
    requestedQuantity: input.data.quantity,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { ok: true as const };
});

export const removeCartItem = onCall(options, async (request) => {
  const uid = await requireActiveUser(request);
  const input = removeCartItemSchema.safeParse(request.data);
  if (!input.success)
    throw new HttpsError("invalid-argument", "Select a valid cart item.");
  await getAdminFirestore()
    .collection("carts")
    .doc(uid)
    .collection("items")
    .doc(input.data.variantId)
    .delete();
  return { ok: true as const };
});

export const moveCartItemToWishlist = onCall(options, async (request) => {
  const uid = await requireActiveUser(request);
  const input = removeCartItemSchema.safeParse(request.data);
  if (!input.success)
    throw new HttpsError("invalid-argument", "Select a valid cart item.");
  const database = getAdminFirestore();
  const itemRef = database
    .collection("carts")
    .doc(uid)
    .collection("items")
    .doc(input.data.variantId);
  await database.runTransaction(async (transaction) => {
    const item = await transaction.get(itemRef);
    if (!item.exists)
      throw new HttpsError("not-found", "This cart item no longer exists.");
    const parsed = cartItemDocumentSchema.parse(item.data());
    transaction.set(
      database
        .collection("wishlists")
        .doc(uid)
        .collection("items")
        .doc(parsed.productId),
      {
        productId: parsed.productId,
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
      },
    );
    transaction.delete(itemRef);
  });
  return { ok: true as const };
});
