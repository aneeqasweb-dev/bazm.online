import { documentIdSchema } from "@bazm/domain";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";

import { requireActiveUser } from "../auth/admin-permissions.js";
import { getAdminFirestore } from "../lib/firebase-admin.js";

const wishlistCommandSchema = z
  .object({ productId: documentIdSchema })
  .strict();

const options = {
  region: "asia-south1",
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true",
};

export const addWishlistItem = onCall(options, async (request) => {
  const uid = await requireActiveUser(request);
  const parsed = wishlistCommandSchema.safeParse(request.data);
  if (!parsed.success)
    throw new HttpsError("invalid-argument", "Select a valid product.");
  const database = getAdminFirestore();
  const product = await database
    .collection("products")
    .doc(parsed.data.productId)
    .get();
  if (!product.exists || product.get("status") !== "PUBLISHED")
    throw new HttpsError("not-found", "This product is unavailable.");
  await database
    .collection("wishlists")
    .doc(uid)
    .collection("items")
    .doc(parsed.data.productId)
    .set(
      {
        productId: parsed.data.productId,
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: false },
    );
  return { ok: true as const };
});

export const removeWishlistItem = onCall(options, async (request) => {
  const uid = await requireActiveUser(request);
  const parsed = wishlistCommandSchema.safeParse(request.data);
  if (!parsed.success)
    throw new HttpsError("invalid-argument", "Select a valid product.");
  await getAdminFirestore()
    .collection("wishlists")
    .doc(uid)
    .collection("items")
    .doc(parsed.data.productId)
    .delete();
  return { ok: true as const };
});
