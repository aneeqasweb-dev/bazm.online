import Image from "next/image";
import Link from "next/link";

import { ReviewReportButton } from "@/components/store/review-report-button";
import type { PublicProductReview } from "@/lib/storefront/server";

function reviewPageHref(productSlug: string, cursor: string) {
  const params = new URLSearchParams({ reviewsAfter: cursor });
  return `/product/${productSlug}?${params.toString()}#reviews`;
}

export function ProductReviews({
  nextCursor,
  productSlug,
  reviews,
}: {
  nextCursor: string | null;
  productSlug: string;
  reviews: PublicProductReview[];
}) {
  return (
    <section aria-labelledby="customer-reviews" className="mt-16" id="reviews">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm tracking-[0.25em] text-amber-300 uppercase">
            Verified voices
          </p>
          <h2 className="mt-3 text-3xl font-semibold" id="customer-reviews">
            Customer reviews
          </h2>
        </div>
        <p className="max-w-xl text-sm text-stone-400">
          Only published, verified-purchase reviews are shown here. New and
          edited reviews wait for moderator approval first.
        </p>
      </div>
      {reviews.length ? (
        <div className="mt-6 grid gap-4">
          {reviews.map((review) => (
            <article
              className="rounded-2xl border border-stone-800 bg-stone-900/70 p-5"
              key={review.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p
                    aria-label={`${review.rating} out of 5 stars`}
                    className="text-amber-200"
                  >
                    {"★".repeat(review.rating)}
                    <span className="text-stone-700">
                      {"★".repeat(5 - review.rating)}
                    </span>
                  </p>
                  <h3 className="mt-2 text-lg font-semibold">
                    {review.title ?? "Verified purchase review"}
                  </h3>
                </div>
                <div className="text-right text-xs text-stone-500">
                  <p>{review.authorName}</p>
                  <time dateTime={review.createdAt}>
                    {new Date(review.createdAt).toLocaleDateString("en-PK", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </time>
                </div>
              </div>
              <p className="mt-3 leading-7 text-stone-300">{review.content}</p>
              {review.images.length ? (
                <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                  {review.images.map((image) => (
                    <div
                      className="relative size-24 shrink-0 overflow-hidden rounded-xl border border-stone-800 bg-stone-950"
                      key={image.path}
                    >
                      <Image
                        alt={image.alt}
                        className="object-cover"
                        fill
                        quality={60}
                        sizes="96px"
                        src={image.url}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <span className="rounded-full bg-stone-800 px-3 py-1 text-xs text-emerald-200">
                  {review.verifiedPurchase
                    ? "Verified purchase"
                    : "Customer review"}
                </span>
                <ReviewReportButton reviewId={review.id} />
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-6 rounded-2xl border border-stone-800 bg-stone-900/70 p-5 text-sm text-stone-400">
          No published reviews yet. Once a delivered customer review is
          approved, it will appear here.
        </p>
      )}
      {nextCursor ? (
        <Link
          className="mt-6 inline-flex rounded-full border border-stone-700 px-5 py-3 text-sm text-stone-100 hover:border-amber-300 hover:text-amber-200"
          href={reviewPageHref(productSlug, nextCursor)}
        >
          Next reviews page
        </Link>
      ) : null}
    </section>
  );
}
