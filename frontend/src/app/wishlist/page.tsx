import Link from "next/link";
import { redirect } from "next/navigation";

import { FirebaseBrowserIntegrations } from "@/components/providers/firebase-browser-integrations";
import { StoreShell } from "@/components/store/store-shell";
import { WishlistButton } from "@/components/store/wishlist-button";
import { getAuthorizedSession } from "@/lib/auth/server-session";
import { getServerFirestore } from "@/lib/firebase/admin";
import { privateMetadata } from "@/lib/seo/config";
import { productDocumentSchema } from "@bazm/domain";

export const metadata = privateMetadata(
  "Your wishlist",
  "Bazm wishlist pages contain private customer selections and are not intended for search indexing.",
);

export default async function WishlistPage() {
  const session = await getAuthorizedSession({ requireVerified: true });
  if (session.reason === "disabled") redirect("/login?reason=disabled");
  if (session.reason === "unverified") redirect("/verify-email");
  if (!session.claims || session.reason)
    redirect("/login?reason=session-expired&next=/wishlist");
  const items = await getServerFirestore()
    .collection("wishlists")
    .doc(session.claims.uid)
    .collection("items")
    .orderBy("createdAt", "desc")
    .limit(50)
    .get();
  const products = (
    await Promise.all(
      items.docs.map(async (item) => {
        const document = await getServerFirestore()
          .collection("products")
          .doc(item.get("productId"))
          .get();
        if (!document.exists || document.get("status") !== "PUBLISHED")
          return null;
        const product = productDocumentSchema.parse(document.data());
        return { id: document.id, product };
      }),
    )
  ).filter((value): value is NonNullable<typeof value> => value !== null);
  return (
    <StoreShell>
      <FirebaseBrowserIntegrations />
      <main className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
        <p className="text-sm tracking-[0.28em] text-amber-300 uppercase">
          Private collection
        </p>
        <h1 className="mt-3 text-4xl font-semibold">Your wishlist</h1>
        {products.length ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {products.map(({ id, product }) => (
              <article
                className="rounded-2xl border border-stone-800 bg-stone-900 p-5"
                key={id}
              >
                <p className="text-sm text-stone-400">
                  {product.tags.join(" · ")}
                </p>
                <h2 className="mt-2 text-xl font-semibold">{product.name}</h2>
                <p className="mt-3 text-amber-200">
                  PKR{" "}
                  {(product.basePrice.amountMinor / 100).toLocaleString(
                    "en-PK",
                    { minimumFractionDigits: 2 },
                  )}
                </p>
                <div className="mt-5 flex gap-3">
                  <Link
                    className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-stone-950"
                    href={`/product/${product.slug}`}
                  >
                    View product
                  </Link>
                  <WishlistButton productId={id} saved />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-dashed border-stone-700 p-8">
            <p className="text-stone-300">Your wishlist is empty.</p>
            <Link
              className="mt-4 inline-flex rounded-full bg-amber-300 px-5 py-3 font-semibold text-stone-950"
              href="/shop"
            >
              Explore the collection
            </Link>
          </div>
        )}
      </main>
    </StoreShell>
  );
}
