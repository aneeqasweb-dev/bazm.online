"use client";

import { useCallableAction } from "@/components/admin/callable-action";

const reviewStatuses = ["PENDING", "PUBLISHED", "REJECTED", "HIDDEN"] as const;

export function ReviewModerationForm({
  reviewId,
  currentStatus,
}: {
  reviewId: string;
  currentStatus: string;
}) {
  const { message, pending, run } = useCallableAction("moderateReview");

  return (
    <form
      className="grid gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const status = String(form.get("status"));
        if (
          ["REJECTED", "HIDDEN"].includes(status) &&
          !window.confirm("Hide or reject this review?")
        ) {
          return;
        }
        await run(
          {
            reviewId,
            status,
            moderationReason:
              String(form.get("moderationReason") ?? "").trim() || null,
          },
          "Review moderated.",
        );
      }}
    >
      <select className="field mt-0" defaultValue={currentStatus} name="status">
        {reviewStatuses.map((status) => (
          <option key={status} value={status}>
            {status.toLowerCase()}
          </option>
        ))}
      </select>
      <input
        className="field mt-0"
        name="moderationReason"
        placeholder="Reason for rejection/hidden"
      />
      <button
        className="rounded-full bg-amber-300 px-3 py-2 text-xs font-semibold text-stone-950 disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving…" : "Moderate"}
      </button>
      {message ? <p className="text-xs text-stone-400">{message}</p> : null}
    </form>
  );
}
