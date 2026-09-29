import Link from "next/link";
import { notFound } from "next/navigation";

import { ReviewForm } from "@/app/account/review-center";
import { FirebaseBrowserIntegrations } from "@/components/providers/firebase-browser-integrations";
import { StoreShell } from "@/components/store/store-shell";
import { getAuthorizedSession } from "@/lib/auth/server-session";
import { authHref } from "@/lib/auth/navigation";
import { listCustomerReviewItems } from "@/lib/reviews/server";
import { privateMetadata } from "@/lib/seo/config";
import { getPublishedProductBySlug } from "@/lib/storefront/server";

export const metadata = privateMetadata(
  "Write a review",
  "Share your experience with a delivered Bazm purchase.",
);

export default async function ProductReviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getPublishedProductBySlug(slug);
  if (!result) notFound();
  const session = await getAuthorizedSession({ requireVerified: true });
  const signedIn = Boolean(session.claims && !session.reason);
  const items = signedIn
    ? (await listCustomerReviewItems(session.claims!.uid)).filter(
        (item) => item.productId === result.product.id,
      )
    : [];
  const productPath = `/product/${result.product.slug}`;
  const signInPath = `/login?${new URLSearchParams({ next: `${productPath}/review` })}`;

  return (
    <StoreShell>
      <FirebaseBrowserIntegrations />
      <main className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <Link
          className="text-sm text-stone-400 hover:underline"
          href={productPath}
        >
          ← Back to {result.product.name}
        </Link>
        <p className="mt-8 text-xs tracking-[0.2em] text-amber-300 uppercase">
          Your experience matters
        </p>
        <h1 className="product-detail-title mt-3 text-4xl">Write a review</h1>
        <p className="mt-3 text-lg text-stone-300">{result.product.name}</p>
        <p className="mt-4 max-w-xl leading-7 text-stone-400">
          Share your thoughts on the quality, style and little details. You can
          review a purchased piece once your order is delivered. Reviews are
          checked before appearing in the store.
        </p>
        <div className="mt-8 grid gap-5">
          {!signedIn ? (
            <section className="rounded-2xl border border-stone-800 bg-stone-900 p-6 sm:p-8">
              <h2 className="text-xl font-semibold">
                {session.reason === "unverified"
                  ? "Verify your email to review"
                  : "Sign in to write a review"}
              </h2>
              <p className="mt-3 leading-6 text-stone-400">
                Use the account you placed your order with so we can find your
                delivered purchase.
              </p>
              <Link
                className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-amber-300 px-6 py-3 font-semibold text-stone-950"
                href={
                  session.reason === "unverified"
                    ? authHref("/verify-email", `${productPath}/review`)
                    : signInPath
                }
              >
                {session.reason === "unverified"
                  ? "Verify email"
                  : "Sign in to review"}
              </Link>
            </section>
          ) : items.length ? (
            items.map((item) => (
              <ReviewForm
                item={item}
                key={`${item.orderId}-${item.variantId}`}
              />
            ))
          ) : (
            <section className="rounded-2xl border border-stone-800 bg-stone-900 p-6 sm:p-8">
              <h2 className="text-xl font-semibold">
                Available after delivery
              </h2>
              <p className="mt-3 leading-6 text-stone-400">
                We couldn’t find a delivered order for this piece in your
                account yet. Once it’s delivered, return here to write your
                review.
              </p>
              <Link
                className="mt-5 inline-flex font-medium text-amber-300 underline underline-offset-4"
                href="/account"
              >
                View your orders
              </Link>
            </section>
          )}
        </div>
      </main>
    </StoreShell>
  );
}
