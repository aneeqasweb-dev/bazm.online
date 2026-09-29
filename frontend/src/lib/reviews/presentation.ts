export const reviewSortOptions = [
  { value: "recent", label: "Most recent" },
  { value: "highest", label: "Highest rated" },
  { value: "lowest", label: "Lowest rated" },
] as const;

export type ReviewSort = (typeof reviewSortOptions)[number]["value"];
export type ReviewSummary = {
  count: number;
  average: number;
  distribution: { rating: number; count: number }[];
};

export function parseReviewSort(value: unknown): ReviewSort {
  return value === "highest" || value === "lowest" ? value : "recent";
}

export function productReviewsHref(
  slug: string,
  sort: ReviewSort,
  cursor?: string | null,
) {
  const query = new URLSearchParams();
  if (sort !== "recent") query.set("reviewSort", sort);
  if (cursor) query.set("reviewsAfter", cursor);
  return `/product/${slug}${query.size ? `?${query}` : ""}#reviews`;
}
