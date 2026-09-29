import styles from "./product-reviews.module.css";

export function ReviewStars({ rating }: { rating: number }) {
  const stars = Array.from({ length: 5 }, (_, index) => (
    <svg key={index} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 2.2 3 6.1 6.7 1-4.9 4.8 1.2 6.7-6-3.2-6 3.2 1.2-6.7L2.3 9.3l6.7-1Z" />
    </svg>
  ));
  return (
    <span
      className={styles.stars}
      role="img"
      aria-label={`${Number(rating.toFixed(1))} out of 5 stars`}
    >
      <span className={styles.starRow}>{stars}</span>
      <span
        className={styles.starFill}
        style={{ width: `${Math.max(0, Math.min(5, rating)) * 20}%` }}
      >
        <span className={styles.starRow}>{stars}</span>
      </span>
    </span>
  );
}
