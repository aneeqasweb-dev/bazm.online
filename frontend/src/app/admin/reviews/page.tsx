import {
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  AdminPagination,
  AdminStatusBadge,
  AdminTableShell,
} from "@/components/admin/admin-ui";
import { listAdminReviews } from "@/lib/admin/admin-data";
import { requireAdminSession } from "@/lib/admin/server-auth";

import { ReviewModerationForm } from "./review-actions";

export default async function AdminReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string; q?: string; status?: string }>;
}) {
  await requireAdminSession("/admin/reviews", ["reviews.manage"]);
  const params = await searchParams;
  const reviews = await listAdminReviews(params);

  return (
    <>
      <AdminPageHeader
        description="Moderate verified-purchase reviews, publish eligible feedback, and keep product rating summaries in sync."
        eyebrow="Trust and content"
        title="Reviews"
      />
      <AdminCard>
        <form className="flex flex-wrap gap-3" method="get">
          <input
            className="field mt-0 max-w-xs"
            defaultValue={params.q ?? ""}
            name="q"
            placeholder="Search review, product, user"
          />
          <select
            className="field mt-0 max-w-xs"
            defaultValue={params.status ?? "ALL"}
            name="status"
          >
            <option value="ALL">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="PUBLISHED">Published</option>
            <option value="REJECTED">Rejected</option>
            <option value="HIDDEN">Hidden</option>
          </select>
          <button
            className="rounded-full border border-stone-700 px-4 py-2 text-sm"
            type="submit"
          >
            Apply
          </button>
        </form>
        {reviews.items.length ? (
          <>
            <AdminTableShell minWidth="980px">
              <thead className="border-b border-stone-800 text-xs tracking-[0.16em] text-stone-500 uppercase">
                <tr>
                  <th className="pb-3">Review</th>
                  <th className="pb-3">Product / order</th>
                  <th className="pb-3">Rating</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 text-right">Moderation</th>
                </tr>
              </thead>
              <tbody>
                {reviews.items.map((review) => (
                  <tr
                    className="border-b border-stone-800/80 align-top"
                    key={review.id}
                  >
                    <td className="max-w-md py-4">
                      <p className="font-medium">
                        {review.title ?? "Untitled review"}
                      </p>
                      <p className="mt-1 line-clamp-3 text-sm text-stone-400">
                        {review.content}
                      </p>
                      <p className="mt-2 text-xs text-stone-500">
                        {review.userId} ·{" "}
                        {new Date(review.createdAt).toLocaleString("en-PK")}
                      </p>
                    </td>
                    <td className="py-4 text-xs text-stone-400">
                      product {review.productId}
                      <br />
                      order {review.orderId}
                    </td>
                    <td className="py-4">
                      {"★".repeat(review.rating)}
                      <p className="text-xs text-stone-500">
                        {review.verifiedPurchase ? "verified" : "unverified"}
                      </p>
                    </td>
                    <td className="py-4">
                      <AdminStatusBadge status={review.status} />
                      {review.reportedCount ? (
                        <p className="mt-2 text-xs text-rose-200">
                          {`${review.reportedCount} customer report${
                            review.reportedCount === 1 ? "" : "s"
                          }`}
                        </p>
                      ) : null}
                      {review.moderationReason ? (
                        <p className="mt-2 text-xs text-stone-500">
                          {review.moderationReason}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-4 text-right">
                      <ReviewModerationForm
                        currentStatus={review.status}
                        reviewId={review.id}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </AdminTableShell>
            <AdminPagination
              basePath="/admin/reviews"
              nextCursor={reviews.nextCursor}
              params={{ q: params.q, status: params.status }}
            />
          </>
        ) : (
          <AdminEmptyState
            description="Reviews appear after customers submit product feedback."
            title="No reviews in this page"
          />
        )}
      </AdminCard>
    </>
  );
}
