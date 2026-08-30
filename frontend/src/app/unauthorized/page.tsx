import Link from "next/link";

import { privateMetadata } from "@/lib/seo/config";

export const metadata = privateMetadata("Access denied");

export default function UnauthorizedPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-stone-950 px-6 text-stone-50">
      <section className="max-w-lg text-center">
        <p className="text-sm tracking-[0.28em] text-amber-300 uppercase">
          Access denied
        </p>
        <h1 className="mt-4 text-4xl font-semibold">
          This area is not available.
        </h1>
        <p className="mt-4 leading-7 text-stone-400">
          Your account is signed in, but it does not have permission to open
          this page.
        </p>
        <Link
          className="mt-8 inline-flex h-12 items-center rounded-full bg-amber-300 px-6 font-semibold text-stone-950"
          href="/account"
        >
          Return to my account
        </Link>
      </section>
    </main>
  );
}
