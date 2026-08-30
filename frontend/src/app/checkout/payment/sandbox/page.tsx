import Link from "next/link";
import { redirect } from "next/navigation";

import { getAuthorizedSession } from "@/lib/auth/server-session";

export default async function SandboxPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ attempt?: string }>;
}) {
  const session = await getAuthorizedSession({ requireVerified: true });
  if (!session.claims) redirect("/login?reason=session-expired&next=/checkout");
  const { attempt } = await searchParams;
  return (
    <main className="min-h-screen bg-stone-950 px-6 py-10 text-stone-50">
      <section className="mx-auto max-w-xl rounded-3xl border border-stone-800 bg-stone-900 p-8">
        <p className="text-sm tracking-[0.28em] text-amber-300 uppercase">
          Sandbox payment
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Payment session created</h1>
        <p className="mt-4 text-stone-300">
          Your order amount and ownership were verified on the server. In the
          configured provider sandbox, payment completion is confirmed only by
          its signed webhook—not by this page.
        </p>
        <p className="mt-3 text-sm text-stone-500">
          Session: {attempt ? attempt.slice(-10) : "unavailable"}
        </p>
        <Link
          className="mt-7 inline-flex rounded-full bg-amber-300 px-5 py-3 font-semibold text-stone-950"
          href="/account"
        >
          View your order
        </Link>
      </section>
    </main>
  );
}
