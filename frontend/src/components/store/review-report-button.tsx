"use client";

import { useCallableAction } from "@/components/admin/callable-action";

export function ReviewReportButton({ reviewId }: { reviewId: string }) {
  const { message, pending, run } = useCallableAction("reportReview");

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        className="text-xs text-stone-500 underline decoration-stone-700 hover:text-rose-200 disabled:opacity-50"
        disabled={pending}
        onClick={() =>
          void run(
            {
              reviewId,
              reason: "Customer reported this review for moderator review.",
            },
            "Review reported.",
          )
        }
        type="button"
      >
        {pending ? "Reporting…" : "Report"}
      </button>
      {message ? (
        <span aria-live="polite" className="text-xs text-stone-500">
          {message}
        </span>
      ) : null}
    </span>
  );
}
