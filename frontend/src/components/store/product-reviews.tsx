import Image from "next/image";
import Link from "next/link";

import { ReviewReportButton } from "@/components/store/review-report-button";
import type { PublicProductReview } from "@/lib/storefront/server";
import {
  productReviewsHref,
  type ReviewSort,
  type ReviewSummary,
} from "@/lib/reviews/presentation";
import { ProductReviewsPanel } from "./product-reviews-panel";
import type { QuestionAccess } from "./product-question-form";
import { ReviewStars } from "./review-stars";
import styles from "./product-reviews.module.css";

export function ProductReviews({
  nextCursor,
  hasPrevious,
  productSlug,
  productName,
  reviews,
  summary,
  sort,
  access,
  initialTab,
}: {
  nextCursor: string | null;
  hasPrevious: boolean;
  productSlug: string;
  productName: string;
  reviews: PublicProductReview[];
  summary: ReviewSummary;
  sort: ReviewSort;
  access: QuestionAccess;
  initialTab: "reviews" | "questions";
}) {
  return (
    <ProductReviewsPanel
      productSlug={productSlug}
      productName={productName}
      summary={summary}
      sort={sort}
      access={access}
      initialTab={initialTab}
    >
      {reviews.length ? (
        reviews.map((review) => (
          <article
            className={styles.review}
            key={review.id}
            data-review-rating={review.rating}
          >
            <div className={styles.reviewHeader}>
              <div>
                <ReviewStars rating={review.rating} />
                <h3>{review.title ?? "Verified purchase review"}</h3>
              </div>
              <div className={styles.reviewMeta}>
                <p>{review.authorName}</p>
                <time dateTime={review.createdAt}>
                  {new Date(review.createdAt).toLocaleDateString("en-PK", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    timeZone: "Asia/Karachi",
                  })}
                </time>
              </div>
            </div>
            <p className={styles.reviewContent}>{review.content}</p>
            {review.images.length ? (
              <div className={styles.photos}>
                {review.images.map((image) => (
                  <div className={styles.photo} key={image.path}>
                    <Image
                      alt={image.alt}
                      className="object-cover"
                      fill
                      quality={60}
                      sizes="88px"
                      src={image.url}
                    />
                  </div>
                ))}
              </div>
            ) : null}
            <div className={styles.reviewFooter}>
              <span className={styles.verified}>
                {review.verifiedPurchase ? (
                  <>
                    <span aria-hidden="true">✓</span> Verified purchase
                  </>
                ) : (
                  "Customer review"
                )}
              </span>
              <ReviewReportButton reviewId={review.id} />
            </div>
          </article>
        ))
      ) : (
        <div className={summary.count ? styles.empty : "sr-only"}>
          <h3>
            {summary.count
              ? "You’re all caught up"
              : "Be the first to share your thoughts"}
          </h3>
          <p>
            {summary.count
              ? "Return to the first page to read all customer reviews."
              : "No reviews yet. Purchased this piece? Tell us what you think after delivery."}
          </p>
        </div>
      )}
      {hasPrevious || nextCursor ? (
        <nav className={styles.pagination} aria-label="Review pages">
          {hasPrevious ? (
            <Link
              className={styles.textLink}
              href={productReviewsHref(productSlug, sort)}
            >
              First reviews page
            </Link>
          ) : null}
          {nextCursor ? (
            <Link
              className={styles.textLink}
              href={productReviewsHref(productSlug, sort, nextCursor)}
            >
              Next reviews page →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </ProductReviewsPanel>
  );
}
