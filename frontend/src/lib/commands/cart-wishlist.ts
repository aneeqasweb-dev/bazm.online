import "server-only";

import {
  cartItemDocumentSchema,
  documentIdSchema,
  inventoryDocumentSchema,
  productDocumentSchema,
  productVariantDocumentSchema,
  quantitySchema,
} from "@bazm/domain";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { getServerFirestore } from "@/lib/firebase/admin";

export class CustomerCommandError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

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
const itemSchema = z.object({ variantId: documentIdSchema }).strict();
const wishlistSchema = z.object({ productId: documentIdSchema }).strict();

async function validateLine(input: z.infer<typeof addCartItemSchema>) {
  const database = getServerFirestore();
  const productRef = database.collection("products").doc(input.productId);
  const variantRef = productRef.collection("variants").doc(input.variantId);
  const [productSnapshot, variantSnapshot] = await Promise.all([
    productRef.get(),
    variantRef.get(),
  ]);
  if (!productSnapshot.exists) {
    throw new CustomerCommandError("This product is no longer available.", 404);
  }
  const product = productDocumentSchema.parse(productSnapshot.data());
  if (product.status !== "PUBLISHED") {
    throw new CustomerCommandError("This product is unavailable.", 409);
  }
  if (!variantSnapshot.exists) {
    throw new CustomerCommandError("This option is no longer available.", 404);
  }
  const variant = productVariantDocumentSchema.parse(variantSnapshot.data());
  if (variant.productId !== input.productId || !variant.isActive) {
    throw new CustomerCommandError("This option is unavailable.", 409);
  }
  const inventorySnapshot = await database
    .collection("inventory")
    .doc(variant.sku)
    .get();
  if (inventorySnapshot.exists) {
    const inventory = inventoryDocumentSchema.parse(inventorySnapshot.data());
    if (
      inventory.productId !== input.productId ||
      inventory.variantId !== input.variantId
    ) {
      throw new CustomerCommandError("This option cannot be ordered.", 409);
    }
    if (input.quantity > inventory.available) {
      throw new CustomerCommandError(
        inventory.available === 0
          ? "This option is out of stock."
          : `Only ${inventory.available} of this option are available.`,
        409,
      );
    }
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

async function addCartItem(uid: string, raw: unknown) {
  const input = addCartItemSchema.safeParse(raw);
  if (!input.success) throw new CustomerCommandError("Choose a valid option.");
  const database = getServerFirestore();
  const cartRef = database.collection("carts").doc(uid);
  const itemRef = cartRef.collection("items").doc(input.data.variantId);
  const existing = await itemRef.get();
  const nextQuantity = existing.exists
    ? quantitySchema.safeParse(
        Number(existing.get("requestedQuantity")) + input.data.quantity,
      )
    : { success: true as const, data: input.data.quantity };
  if (!nextQuantity.success) {
    throw new CustomerCommandError("The requested quantity is too large.");
  }
  const line = await validateLine({
    ...input.data,
    quantity: nextQuantity.data,
  });
  await database.runTransaction(async (transaction) => {
    const cart = await transaction.get(cartRef);
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
      requestedQuantity: nextQuantity.data,
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
}

async function updateCartItem(uid: string, raw: unknown) {
  const input = updateCartItemSchema.safeParse(raw);
  if (!input.success)
    throw new CustomerCommandError("Choose a valid quantity.");
  const itemRef = getServerFirestore()
    .collection("carts")
    .doc(uid)
    .collection("items")
    .doc(input.data.variantId);
  const item = await itemRef.get();
  if (!item.exists) throw new CustomerCommandError("Cart item not found.", 404);
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
}

async function removeCartItem(uid: string, raw: unknown) {
  const input = itemSchema.safeParse(raw);
  if (!input.success)
    throw new CustomerCommandError("Select a valid cart item.");
  await getServerFirestore()
    .collection("carts")
    .doc(uid)
    .collection("items")
    .doc(input.data.variantId)
    .delete();
  return { ok: true as const };
}

async function moveCartItemToWishlist(uid: string, raw: unknown) {
  const input = itemSchema.safeParse(raw);
  if (!input.success)
    throw new CustomerCommandError("Select a valid cart item.");
  const database = getServerFirestore();
  const itemRef = database
    .collection("carts")
    .doc(uid)
    .collection("items")
    .doc(input.data.variantId);
  await database.runTransaction(async (transaction) => {
    const item = await transaction.get(itemRef);
    if (!item.exists)
      throw new CustomerCommandError("Cart item not found.", 404);
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
}

async function updateWishlist(uid: string, raw: unknown, remove: boolean) {
  const input = wishlistSchema.safeParse(raw);
  if (!input.success) throw new CustomerCommandError("Select a valid product.");
  const database = getServerFirestore();
  const itemRef = database
    .collection("wishlists")
    .doc(uid)
    .collection("items")
    .doc(input.data.productId);
  if (remove) {
    await itemRef.delete();
  } else {
    const product = await database
      .collection("products")
      .doc(input.data.productId)
      .get();
    if (!product.exists || product.get("status") !== "PUBLISHED") {
      throw new CustomerCommandError("This product is unavailable.", 404);
    }
    await itemRef.set({
      productId: input.data.productId,
      schemaVersion: 1,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  return { ok: true as const };
}

export const cartWishlistCommands = {
  addCartItem,
  updateCartItem,
  removeCartItem,
  moveCartItemToWishlist,
  addWishlistItem: (uid: string, raw: unknown) =>
    updateWishlist(uid, raw, false),
  removeWishlistItem: (uid: string, raw: unknown) =>
    updateWishlist(uid, raw, true),
} as const;
