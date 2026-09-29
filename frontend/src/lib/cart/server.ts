import "server-only";

import { cartItemDocumentSchema } from "@bazm/domain";
import type { CartLine } from "@/components/store/cart-panel";
import { getServerFirestore } from "@/lib/firebase/admin";

// Callers derive the owner from the verified session or HttpOnly guest cookie.
export async function listCartLines(
  ownerId: string | null,
  collection: "carts" | "guestCarts",
): Promise<CartLine[]> {
  if (!ownerId) return [];
  const snapshot = await getServerFirestore()
    .collection(collection)
    .doc(ownerId)
    .collection("items")
    .orderBy("updatedAt", "desc")
    .limit(50)
    .get();
  return snapshot.docs.map((document) => {
    const item = cartItemDocumentSchema.parse(document.data());
    return {
      variantId: item.variantId,
      requestedQuantity: item.requestedQuantity,
      snapshot: {
        name: item.snapshot.name,
        slug: item.snapshot.slug,
        brand: item.snapshot.brand,
        image: { url: item.snapshot.image.url, alt: item.snapshot.image.alt },
        price: item.snapshot.price,
        sku: item.snapshot.sku,
        color: item.snapshot.color,
        size: item.snapshot.size,
      },
    };
  });
}
