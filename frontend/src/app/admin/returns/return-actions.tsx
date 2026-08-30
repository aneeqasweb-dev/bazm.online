"use client";

import { useCallableAction } from "@/components/admin/callable-action";

const returnStatuses = [
  "REQUESTED",
  "APPROVED",
  "REJECTED",
  "RECEIVED",
  "REFUNDED",
  "CLOSED",
] as const;

export function ReturnStatusForm({
  returnId,
  currentStatus,
  refundPaymentId,
  refundAmount,
  condition,
}: {
  returnId: string;
  currentStatus: string;
  refundPaymentId: string | null;
  refundAmount: { amountMinor: number; currency: "PKR" } | null;
  condition: string;
}) {
  const { message, pending, run } = useCallableAction("updateReturnStatus");

  return (
    <form
      className="grid gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const status = String(form.get("status"));
        if (
          ["RECEIVED", "REJECTED", "REFUNDED", "CLOSED"].includes(status) &&
          !window.confirm("This is a sensitive return change. Continue?")
        ) {
          return;
        }
        const amountValue = String(form.get("refundAmount") ?? "").trim();
        const amount = amountValue ? Number(amountValue) : null;
        await run(
          {
            returnId,
            status,
            staffNote: String(form.get("staffNote") ?? "").trim() || null,
            refundPaymentId:
              String(form.get("refundPaymentId") ?? "").trim() || null,
            refundAmount:
              amount !== null && Number.isFinite(amount)
                ? { amountMinor: Math.round(amount * 100), currency: "PKR" }
                : null,
            refundIdempotencyKey:
              String(form.get("refundIdempotencyKey") ?? "").trim() || null,
            refundReason: String(form.get("refundReason") ?? "").trim() || null,
            condition: String(form.get("condition") ?? "").trim() || null,
          },
          "Return updated.",
        );
      }}
    >
      <select className="field mt-0" defaultValue={currentStatus} name="status">
        {returnStatuses.map((status) => (
          <option key={status} value={status}>
            {status.toLowerCase()}
          </option>
        ))}
      </select>
      <select
        className="field mt-0"
        defaultValue={
          ["RESELLABLE", "DAMAGED"].includes(condition) ? condition : ""
        }
        name="condition"
      >
        <option value="">Condition on receipt</option>
        <option value="RESELLABLE">Resellable</option>
        <option value="DAMAGED">Damaged</option>
      </select>
      <input
        className="field mt-0"
        defaultValue={refundPaymentId ?? ""}
        name="refundPaymentId"
        placeholder="Payment ID for refund"
      />
      <input
        className="field mt-0"
        defaultValue={
          refundAmount ? (refundAmount.amountMinor / 100).toFixed(2) : ""
        }
        min="0.01"
        name="refundAmount"
        placeholder="Refund amount"
        step="0.01"
        type="number"
      />
      <input
        className="field mt-0"
        name="refundIdempotencyKey"
        placeholder="Refund key (optional)"
      />
      <input
        className="field mt-0"
        name="refundReason"
        placeholder="Refund reason"
      />
      <input className="field mt-0" name="staffNote" placeholder="Staff note" />
      <button
        className="rounded-full bg-amber-300 px-3 py-2 text-xs font-semibold text-stone-950 disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving…" : "Update return"}
      </button>
      {message ? <p className="text-xs text-stone-400">{message}</p> : null}
    </form>
  );
}
