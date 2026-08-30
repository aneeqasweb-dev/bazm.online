"use client";

import { useCallableAction } from "@/components/admin/callable-action";
import type { AdminPaymentRow } from "@/lib/admin/admin-data";

export function RefundPaymentForm({ payment }: { payment: AdminPaymentRow }) {
  const { message, pending, run } = useCallableAction("initiateRefund");
  const refundableMinor = Math.max(
    0,
    payment.amountMinor - payment.refundedMinor,
  );
  const disabled =
    refundableMinor <= 0 ||
    !["PAID", "PARTIALLY_REFUNDED"].includes(payment.status);

  return (
    <form
      className="grid gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!window.confirm("Initiate a refund for this payment?")) return;
        const form = new FormData(event.currentTarget);
        await run(
          {
            paymentId: payment.id,
            idempotencyKey: `refund-${payment.id}-${Date.now()}`,
            amount: {
              amountMinor: Math.round(Number(form.get("amount")) * 100),
              currency: "PKR",
            },
            reason: form.get("reason"),
          },
          "Refund initiated.",
        );
      }}
    >
      <input
        aria-label={`Refund amount for payment ${payment.id}`}
        className="field mt-0"
        defaultValue={(refundableMinor / 100).toFixed(2)}
        disabled={disabled}
        min="1"
        name="amount"
        step="0.01"
        type="number"
      />
      <input
        aria-label={`Refund reason for payment ${payment.id}`}
        className="field mt-0"
        defaultValue="Admin refund"
        disabled={disabled}
        name="reason"
        placeholder="Reason"
      />
      <button
        className="rounded-full border border-amber-900 px-3 py-2 text-xs text-amber-200 disabled:opacity-50"
        disabled={disabled || pending}
        type="submit"
      >
        {pending ? "Starting…" : "Refund"}
      </button>
      {message ? <p className="text-xs text-stone-400">{message}</p> : null}
    </form>
  );
}
