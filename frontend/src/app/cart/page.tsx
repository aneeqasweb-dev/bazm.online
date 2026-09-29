import { redirect } from "next/navigation";

import { FirebaseBrowserIntegrations } from "@/components/providers/firebase-browser-integrations";
import { CartWorkspace } from "@/components/store/cart-workspace";
import { getGuestCartId } from "@/lib/cart/guest-session";
import { StoreShell } from "@/components/store/store-shell";
import { getAuthorizedSession } from "@/lib/auth/server-session";
import { listCartLines } from "@/lib/cart/server";
import { privateMetadata } from "@/lib/seo/config";

export const dynamic = "force-dynamic";
export const metadata = privateMetadata(
  "Shopping cart",
  "Bazm cart pages contain private shopping selections and are not intended for search indexing.",
);

export default async function CartPage() {
  const session = await getAuthorizedSession({ requireVerified: true });
  if (session.reason === "disabled") redirect("/login?reason=disabled");
  const authenticated = Boolean(session.claims && !session.reason);
  const guestId = await getGuestCartId();
  const ownerId = authenticated ? session.claims!.uid : guestId;
  const items = await listCartLines(
    ownerId,
    authenticated ? "carts" : "guestCarts",
  );
  return (
    <StoreShell>
      <FirebaseBrowserIntegrations />
      <main className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
        <p className="text-sm tracking-[0.28em] text-amber-300 uppercase">
          Your selection
        </p>
        <h1 className="mt-3 text-4xl font-semibold">Shopping cart</h1>
        <p className="mt-3 max-w-2xl text-stone-400">
          Your favourites, saved for later. Review your items below. Shipping
          and discounts are calculated at checkout.
        </p>
        <CartWorkspace
          items={items}
          guest={!authenticated}
          needsMerge={authenticated && Boolean(guestId)}
          checkoutHref="/checkout"
        />
      </main>
    </StoreShell>
  );
}
