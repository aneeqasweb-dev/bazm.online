import Link from "next/link";
import { redirect } from "next/navigation";

import { FirebaseBrowserIntegrations } from "@/components/providers/firebase-browser-integrations";
import { LogoutButton } from "@/components/auth/logout-button";
import { getAuthorizedSession } from "@/lib/auth/server-session";
import { getServerFirestore } from "@/lib/firebase/admin";
import { listCustomerOrders } from "@/lib/orders/server";
import { listCustomerReviewItems } from "@/lib/reviews/server";
import { getCustomerReturnPolicy } from "@/lib/returns/server";
import { privateMetadata } from "@/lib/seo/config";

import { OrderHistory } from "./order-history";
import { ProfileForm } from "./profile-form";
import { ReviewCenter } from "./review-center";
import { SupportCenter } from "./support-center";

export const metadata = privateMetadata(
  "Your account",
  "Bazm account pages contain private customer information and are not intended for search indexing.",
);

export default async function AccountPage() {
  const session = await getAuthorizedSession({ requireVerified: true });
  if (session.reason === "expired" || session.reason === "stale-claims") {
    redirect("/login?reason=session-expired&next=/account");
  }
  if (session.reason === "disabled") {
    redirect("/login?reason=disabled");
  }
  if (session.reason === "unverified") {
    redirect("/verify-email");
  }
  if (!session.claims) {
    redirect("/login?reason=session-expired&next=/account");
  }

  const [profile, orders, returnPolicy, reviewItems, ticketSnapshot] =
    await Promise.all([
      getServerFirestore().collection("users").doc(session.claims.uid).get(),
      listCustomerOrders(session.claims.uid),
      getCustomerReturnPolicy(),
      listCustomerReviewItems(session.claims.uid),
      getServerFirestore()
        .collection("supportTickets")
        .where("userId", "==", session.claims.uid)
        .orderBy("updatedAt", "desc")
        .limit(20)
        .get(),
    ]);
  if (!profile.exists || profile.get("isActive") !== true) {
    redirect("/login?reason=disabled");
  }
  const tickets = await Promise.all(
    ticketSnapshot.docs.map(async (ticket) => {
      const messages = await ticket.ref
        .collection("messages")
        .orderBy("createdAt", "asc")
        .limit(50)
        .get();
      const iso = (value: { toDate(): Date }) => value.toDate().toISOString();
      return {
        id: ticket.id,
        subject: String(ticket.get("subject")),
        status: String(ticket.get("status")),
        relatedOrderId: ticket.get("relatedOrderId") as string | null,
        updatedAt: iso(ticket.get("updatedAt")),
        messages: messages.docs.map((item) => ({
          id: item.id,
          body: String(item.get("body")),
          authorRole: String(item.get("authorRole")),
          createdAt: iso(item.get("createdAt")),
        })),
      };
    }),
  );

  return (
    <main className="min-h-screen bg-stone-950 px-6 py-10 text-stone-50">
      <FirebaseBrowserIntegrations />
      <div className="mx-auto max-w-3xl">
        <header className="flex items-center justify-between gap-4">
          <Link className="text-sm text-stone-400 hover:text-white" href="/">
            ← Bazm
          </Link>
          <LogoutButton />
        </header>
        <section className="mt-12 rounded-3xl border border-stone-800 bg-stone-900 p-6 sm:p-10">
          <p className="text-sm tracking-[0.28em] text-amber-300 uppercase">
            Customer profile
          </p>
          <h1 className="mt-3 text-4xl font-semibold">Your account</h1>
          <p className="mt-3 text-stone-400">{session.claims.email}</p>
          <ProfileForm
            initialAvatarPath={
              typeof profile.get("avatarPath") === "string"
                ? profile.get("avatarPath")
                : null
            }
            initialName={
              typeof profile.get("name") === "string" ? profile.get("name") : ""
            }
            initialPhone={
              typeof profile.get("phone") === "string"
                ? profile.get("phone")
                : ""
            }
          />
          <OrderHistory orders={orders} returnPolicy={returnPolicy} />
          <ReviewCenter items={reviewItems} />
          <SupportCenter tickets={tickets} />
        </section>
      </div>
    </main>
  );
}
