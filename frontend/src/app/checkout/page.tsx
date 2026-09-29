import { redirect } from "next/navigation";

import { CheckoutCartMerge } from "./checkout-cart-merge";
import { CheckoutWorkspace } from "./checkout-workspace";
import { getGuestCartId } from "@/lib/cart/guest-session";
import { listCartLines } from "@/lib/cart/server";
import { getAuthorizedSession } from "@/lib/auth/server-session";
import { listCheckoutAddresses } from "@/lib/orders/server";

export default async function CheckoutPage() {
  const session = await getAuthorizedSession({ requireVerified: true });
  if (session.reason === "disabled") redirect("/login?reason=disabled");
  const guestId = await getGuestCartId();
  const authenticated = Boolean(session.claims && !session.reason);
  if (authenticated && guestId) return <CheckoutCartMerge />;
  const [addresses, items] = await Promise.all([
    authenticated
      ? listCheckoutAddresses(session.claims!.uid)
      : Promise.resolve([]),
    listCartLines(
      authenticated ? session.claims!.uid : guestId,
      authenticated ? "carts" : "guestCarts",
    ),
  ]);
  const accountAction = authenticated
    ? undefined
    : session.reason === "unverified"
      ? {
          href: "/verify-email?next=%2Fcheckout",
          label: "Verify email to continue",
          message:
            "Verify your email to save your delivery address and complete your demo order.",
        }
      : {
          href: "/login?next=/checkout",
          label: "Sign in to pay",
          message:
            "Your bag is saved. Sign in to add your delivery address and complete your demo order.",
        };
  return (
    <CheckoutWorkspace
      addresses={addresses}
      items={items}
      accountAction={accountAction}
    />
  );
}
