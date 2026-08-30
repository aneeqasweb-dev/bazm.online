"use client";

import { useCallableAction } from "@/components/admin/callable-action";

const orderStatuses = [
  "PENDING_PAYMENT",
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "RETURN_REQUESTED",
  "RETURNED",
  "REFUNDED",
] as const;

export function OrderTransitionForm({
  orderId,
  currentStatus,
}: {
  orderId: string;
  currentStatus: string;
}) {
  const { message, pending, run } = useCallableAction("transitionOrder");

  return (
    <form
      className="grid gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const status = String(form.get("status"));
        if (
          ["CANCELLED", "REFUNDED"].includes(status) &&
          !window.confirm("This is a sensitive order change. Continue?")
        ) {
          return;
        }
        await run(
          {
            orderId,
            status,
            trackingNumber:
              String(form.get("trackingNumber") ?? "").trim() || null,
            reason: String(form.get("reason") ?? "").trim() || null,
          },
          "Order updated.",
        );
      }}
    >
      <select
        aria-label={`Next status for order ${orderId}`}
        className="field mt-0"
        defaultValue={currentStatus}
        name="status"
      >
        {orderStatuses.map((status) => (
          <option key={status} value={status}>
            {status.replaceAll("_", " ").toLowerCase()}
          </option>
        ))}
      </select>
      <input
        className="field mt-0"
        name="trackingNumber"
        placeholder="Tracking # for shipped"
      />
      <input
        className="field mt-0"
        name="reason"
        placeholder="Reason / admin note"
      />
      <button
        className="rounded-full bg-amber-300 px-3 py-2 text-xs font-semibold text-stone-950 disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving…" : "Update"}
      </button>
      {message ? <p className="text-xs text-stone-400">{message}</p> : null}
    </form>
  );
}
