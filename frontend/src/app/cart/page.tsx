import { cartItemDocumentSchema } from "@bazm/domain";
import { redirect } from "next/navigation";

import { FirebaseBrowserIntegrations } from "@/components/providers/firebase-browser-integrations";
import { CartPanel, type CartLine } from "@/components/store/cart-panel";
import { StoreShell } from "@/components/store/store-shell";
import { getAuthorizedSession } from "@/lib/auth/server-session";
import { getServerFirestore } from "@/lib/firebase/admin";
import { privateMetadata } from "@/lib/seo/config";

export const dynamic = "force-dynamic";
export const metadata = privateMetadata(
  "Shopping cart",
  "Bazm cart pages contain private shopping selections and are not intended for search indexing.",
);

export default async function CartPage() {
  const session = await getAuthorizedSession({ requireVerified: true });
  if (session.reason === "disabled") redirect("/login?reason=disabled");
  if (session.reason === "unverified") redirect("/verify-email");
  if (!session.claims || session.reason)
    redirect("/login?reason=session-expired&next=/cart");
  const snapshot = await getServerFirestore()
    .collection("carts")
    .doc(session.claims.uid)
    .collection("items")
    .orderBy("updatedAt", "desc")
    .limit(50)
    .get();
  const items: CartLine[] = snapshot.docs.map((document) => {
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
  return (
    <StoreShell>
      <FirebaseBrowserIntegrations />
      <main className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
        <p className="text-sm tracking-[0.28em] text-amber-300 uppercase">
          Your selection
        </p>
        <h1 className="mt-3 text-4xl font-semibold">Shopping cart</h1>
        <p className="mt-3 max-w-2xl text-stone-400">
          Prices shown are saved display snapshots. Final prices, stock,
          shipping, and discounts are calculated securely during checkout.
        </p>
        <CartPanel items={items} />
      </main>
    </StoreShell>
  );
}
