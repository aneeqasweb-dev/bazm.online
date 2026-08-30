import Link from "next/link";
import { redirect } from "next/navigation";

import { CheckoutWorkspace } from "@/app/checkout/checkout-workspace";
import { LogoutButton } from "@/components/auth/logout-button";
import { getAuthorizedSession } from "@/lib/auth/server-session";
import { listCheckoutAddresses } from "@/lib/orders/server";

export default async function CheckoutPage() {
  const session = await getAuthorizedSession({ requireVerified: true });
  if (session.reason === "expired" || session.reason === "stale-claims")
    redirect("/login?reason=session-expired&next=/checkout");
  if (session.reason === "disabled") redirect("/login?reason=disabled");
  if (session.reason === "unverified") redirect("/verify-email");
  if (!session.claims) redirect("/login?reason=session-expired&next=/checkout");
  const addresses = await listCheckoutAddresses(session.claims.uid);
  return (
    <main className="min-h-screen bg-stone-950 px-6 py-10 text-stone-50">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-center justify-between gap-4">
          <Link
            className="text-sm text-stone-400 hover:text-white"
            href="/cart"
          >
            ← Cart
          </Link>
          <LogoutButton />
        </header>
        <section className="mt-10">
          <p className="text-sm tracking-[0.28em] text-amber-300 uppercase">
            Secure checkout
          </p>
          <h1 className="mt-3 text-4xl font-semibold">Delivery and payment</h1>
          <p className="mt-3 text-stone-400">
            Prices, discounts, and inventory are verified when you place the
            order.
          </p>
        </section>
        <CheckoutWorkspace addresses={addresses} />
      </div>
    </main>
  );
}
