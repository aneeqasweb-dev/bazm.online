import "server-only";

import {
  cartItemDocumentSchema,
  documentIdSchema,
  inventoryDocumentSchema,
  productDocumentSchema,
  productVariantDocumentSchema,
  quantitySchema,
} from "@bazm/domain";
import {
  FieldValue,
  type Transaction,
  type DocumentReference,
} from "firebase-admin/firestore";
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

type CartCollection = "carts" | "guestCarts";

async function validateLine(
  input: z.infer<typeof addCartItemSchema>,
  transaction?: Transaction,
) {
  const database = getServerFirestore();
  const productRef = database.collection("products").doc(input.productId);
  const variantRef = productRef.collection("variants").doc(input.variantId);
  const read = (reference: DocumentReference) =>
    transaction ? transaction.get(reference) : reference.get();
  const [productSnapshot, variantSnapshot] = await Promise.all([
    read(productRef),
    read(variantRef),
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
  const inventorySnapshot = await read(
    database.collection("inventory").doc(variant.sku),
  );
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

async function addCartItem(
  uid: string,
  raw: unknown,
  collection: CartCollection = "carts",
) {
  const input = addCartItemSchema.safeParse(raw);
  if (!input.success)
    throw new CustomerCommandError("Choose a valid option and quantity.");
  const database = getServerFirestore();
  const cartRef = database.collection(collection).doc(uid);
  const itemRef = cartRef.collection("items").doc(input.data.variantId);
  await database.runTransaction(async (transaction) => {
    const [cart, existing] = await Promise.all([
      transaction.get(cartRef),
      transaction.get(itemRef),
    ]);
    if (collection === "guestCarts" && cart.get("mergedAt"))
      throw new CustomerCommandError(
        "Your bag has moved to your account. Refresh the page and add this item again.",
        409,
      );
    const saved = existing.exists
      ? cartItemDocumentSchema.parse(existing.data())
      : null;
    if (saved && saved.productId !== input.data.productId)
      throw new CustomerCommandError(
        "This option conflicts with another item in your bag.",
        409,
      );
    const nextQuantity = quantitySchema.safeParse(
      (saved?.requestedQuantity ?? 0) + input.data.quantity,
    );
    if (!nextQuantity.success)
      throw new CustomerCommandError("The requested quantity is too large.");
    const line = await validateLine(
      { ...input.data, quantity: nextQuantity.data },
      transaction,
    );
    if (!existing.exists) {
      const items = await transaction.get(
        cartRef.collection("items").limit(50),
      );
      if (items.size >= 50)
        throw new CustomerCommandError(
          "Your bag holds up to 50 different items. Remove an item before adding another.",
          409,
        );
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
      requestedQuantity: nextQuantity.data,
      snapshot: saved?.snapshot ?? line.snapshot,
      schemaVersion: 1,
      createdAt: existing.exists
        ? existing.get("createdAt")
        : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { ok: true as const };
}

async function updateCartItem(
  uid: string,
  raw: unknown,
  collection: CartCollection = "carts",
) {
  const input = updateCartItemSchema.safeParse(raw);
  if (!input.success)
    throw new CustomerCommandError("Choose a valid quantity.");
  const database = getServerFirestore();
  const itemRef = database
    .collection(collection)
    .doc(uid)
    .collection("items")
    .doc(input.data.variantId);
  await database.runTransaction(async (transaction) => {
    const item = await transaction.get(itemRef);
    if (!item.exists)
      throw new CustomerCommandError("Cart item not found.", 404);
    const parsed = cartItemDocumentSchema.parse(item.data());
    await validateLine(
      {
        productId: parsed.productId,
        variantId: parsed.variantId,
        quantity: input.data.quantity,
      },
      transaction,
    );
    transaction.update(itemRef, {
      requestedQuantity: input.data.quantity,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
  return { ok: true as const };
}

async function removeCartItem(
  uid: string,
  raw: unknown,
  collection: CartCollection = "carts",
) {
  const input = itemSchema.safeParse(raw);
  if (!input.success)
    throw new CustomerCommandError("Select a valid cart item.");
  await getServerFirestore()
    .collection(collection)
    .doc(uid)
    .collection("items")
    .doc(input.data.variantId)
    .delete();
  return { ok: true as const };
}

export async function mergeGuestCart(uid: string, guestId: string) {
  const database = getServerFirestore();
  const guestRef = database.collection("guestCarts").doc(guestId);
  const cartRef = database.collection("carts").doc(uid);
  await database.runTransaction(async (transaction) => {
    const [guestItems, accountItems, cart] = await Promise.all([
      transaction.get(guestRef.collection("items").limit(51)),
      transaction.get(cartRef.collection("items").limit(51)),
      transaction.get(cartRef),
    ]);
    if (guestItems.empty) return;
    const account = new Map(
      accountItems.docs.map((document) => [document.id, document]),
    );
    const allIds = new Set([
      ...account.keys(),
      ...guestItems.docs.map((document) => document.id),
    ]);
    if (allIds.size > 50)
      throw new CustomerCommandError(
        "Your combined bag has more than 50 items. Remove some items from your account bag below, then retry.",
        409,
      );
    // Read both carts inside one transaction. Concurrent merges and retries cannot add twice.
    for (const document of guestItems.docs) {
      const guest = cartItemDocumentSchema.parse(document.data());
      const existing = account.get(document.id);
      const saved = existing
        ? cartItemDocumentSchema.parse(existing.data())
        : null;
      if (saved && saved.productId !== guest.productId)
        throw new CustomerCommandError(
          "An item conflicts with an option already in your account bag. Remove that option, then retry.",
          409,
        );
      const quantity = quantitySchema.safeParse(
        (saved?.requestedQuantity ?? 0) + guest.requestedQuantity,
      );
      if (!quantity.success)
        throw new CustomerCommandError(
          "A combined quantity is too large. Reduce the quantity in your account bag, then retry.",
          409,
        );
      transaction.set(cartRef.collection("items").doc(document.id), {
        ...guest,
        snapshot: saved?.snapshot ?? guest.snapshot,
        requestedQuantity: quantity.data,
        createdAt: existing?.get("createdAt") ?? document.get("createdAt"),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.delete(document.ref);
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
    // A late guest request must not recreate an already transferred bag.
    transaction.set(
      guestRef,
      { mergedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  });
  return { ok: true as const };
}

export const guestCartCommands = {
  addCartItem: (guestId: string, raw: unknown) =>
    addCartItem(guestId, raw, "guestCarts"),
  updateCartItem: (guestId: string, raw: unknown) =>
    updateCartItem(guestId, raw, "guestCarts"),
  removeCartItem: (guestId: string, raw: unknown) =>
    removeCartItem(guestId, raw, "guestCarts"),
} as const;

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
