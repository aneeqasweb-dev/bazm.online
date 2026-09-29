"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import {
  productReviewsHref,
  parseReviewSort,
  reviewSortOptions,
  type ReviewSort,
  type ReviewSummary,
} from "@/lib/reviews/presentation";
import {
  ProductQuestionForm,
  type QuestionAccess,
} from "./product-question-form";
import { ReviewStars } from "./review-stars";
import styles from "./product-reviews.module.css";

export function ProductReviewsPanel({
  productSlug,
  productName,
  summary,
  sort,
  access,
  initialTab = "reviews",
  children,
}: {
  productSlug: string;
  productName: string;
  summary: ReviewSummary;
  sort: ReviewSort;
  access: QuestionAccess;
  initialTab?: "reviews" | "questions";
  children: ReactNode;
}) {
  const [tab, setTab] = useState(initialTab);
  const [pending, startTransition] = useTransition();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const router = useRouter();
  const tabs = ["reviews", "questions"] as const;

  function onTabKey(event: KeyboardEvent, index: number) {
    let next: number;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft")
      next = 1 - index;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = 1;
    else return;
    event.preventDefault();
    setTab(tabs[next]);
    tabRefs.current[next]?.focus();
  }

  return (
    <section
      aria-labelledby="customer-reviews"
      className={styles.section}
      id="reviews"
    >
      <h2 id="customer-reviews" className={styles.heading}>
        Customer Reviews
      </h2>
      <div className={styles.summary}>
        <div className={styles.overall}>
          {summary.count > 0 ? (
            <p className={styles.average}>
              {summary.average.toFixed(1)} <span>/ 5</span>
            </p>
          ) : null}
          <ReviewStars rating={summary.average} />
          <p>
            Based on {summary.count}{" "}
            {summary.count === 1 ? "review" : "reviews"}
          </p>
        </div>
        <div className={styles.breakdown} aria-label="Rating breakdown">
          {summary.distribution.map(({ rating, count }) => (
            <div
              className={styles.ratingRow}
              key={rating}
              role="img"
              aria-label={`${rating} stars: ${count} ${count === 1 ? "review" : "reviews"}`}
            >
              <ReviewStars rating={rating} />
              <span className={styles.bar} aria-hidden="true">
                <span
                  style={{
                    width: `${summary.count ? (count / summary.count) * 100 : 0}%`,
                  }}
                />
              </span>
              <span className={styles.count} aria-hidden="true">
                ({count})
              </span>
            </div>
          ))}
        </div>
        <div className={styles.actions}>
          <Link
            className={styles.primaryButton}
            href={`/product/${productSlug}/review`}
          >
            Write a review
          </Link>
          <button
            className={styles.primaryButton}
            type="button"
            onClick={() => {
              setTab("questions");
              tabRefs.current[1]?.focus();
            }}
          >
            Ask a question
          </button>
        </div>
      </div>
      <div className={styles.toolbar}>
        <div
          className={styles.tabs}
          role="tablist"
          aria-label="Customer feedback"
        >
          {tabs.map((item, index) => (
            <button
              key={item}
              type="button"
              role="tab"
              id={`${item}-tab`}
              aria-controls={`${item}-panel`}
              aria-selected={tab === item}
              tabIndex={tab === item ? 0 : -1}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              onKeyDown={(event) => onTabKey(event, index)}
              onClick={() => setTab(item)}
            >
              {item === "reviews" ? `Reviews (${summary.count})` : "Questions"}
            </button>
          ))}
        </div>
        {tab === "reviews" ? (
          <label className={styles.sort}>
            Sort by
            <select
              aria-label="Sort reviews"
              value={sort}
              disabled={pending}
              onChange={(event) => {
                const href = productReviewsHref(
                  productSlug,
                  parseReviewSort(event.target.value),
                );
                startTransition(() => router.push(href, { scroll: false }));
              }}
            >
              {reviewSortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <div
        id="reviews-panel"
        role="tabpanel"
        aria-labelledby="reviews-tab"
        tabIndex={0}
        hidden={tab !== "reviews"}
        aria-busy={pending}
        className={styles.panel}
      >
        {pending ? (
          <p role="status" className={styles.loading}>
            Updating reviews…
          </p>
        ) : null}
        {children}
      </div>
      <div
        id="questions-panel"
        role="tabpanel"
        aria-labelledby="questions-tab"
        tabIndex={0}
        hidden={tab !== "questions"}
        className={styles.panel}
      >
        <ProductQuestionForm
          productSlug={productSlug}
          productName={productName}
          access={access}
        />
      </div>
    </section>
  );
}
