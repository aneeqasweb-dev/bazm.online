"use client";

import {
  CallableActionButton,
  useCallableAction,
} from "@/components/admin/callable-action";

function money(value: FormDataEntryValue | null) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? { amountMinor: Math.round(number * 100), currency: "PKR" }
    : null;
}

function limit(value: FormDataEntryValue | null) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

export function CouponCreateForm() {
  const { message, pending, run } = useCallableAction("createCoupon");

  return (
    <form
      className="grid gap-3 rounded-2xl border border-stone-800 p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const kind = String(form.get("discountKind"));
        const discount =
          kind === "PERCENTAGE"
            ? {
                kind,
                percentage: Number(form.get("percentage")),
              }
            : {
                kind,
                amount: money(form.get("fixedAmount")),
              };
        const ok = await run(
          {
            code: form.get("code"),
            discount,
            minimumOrderAmount: money(form.get("minimumOrderAmount")),
            maximumDiscountAmount: money(form.get("maximumDiscountAmount")),
            startsAt: form.get("startsAt"),
            endsAt: form.get("endsAt"),
            usageLimit: limit(form.get("usageLimit")),
            perCustomerLimit: limit(form.get("perCustomerLimit")),
          },
          "Coupon draft created.",
        );
        if (ok) event.currentTarget.reset();
      }}
    >
      <h2 className="text-xl font-semibold">Create coupon</h2>
      <input className="field" name="code" placeholder="SAVE10" required />
      <div className="grid gap-3 sm:grid-cols-3">
        <select className="field" name="discountKind" defaultValue="PERCENTAGE">
          <option value="PERCENTAGE">Percentage</option>
          <option value="FIXED">Fixed PKR</option>
        </select>
        <input
          className="field"
          max="100"
          min="1"
          name="percentage"
          placeholder="10"
          type="number"
        />
        <input
          className="field"
          min="1"
          name="fixedAmount"
          placeholder="500.00"
          step="0.01"
          type="number"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-stone-400">
          Starts
          <input
            className="field"
            name="startsAt"
            required
            type="datetime-local"
          />
        </label>
        <label className="text-sm text-stone-400">
          Ends
          <input
            className="field"
            name="endsAt"
            required
            type="datetime-local"
          />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          className="field"
          name="minimumOrderAmount"
          placeholder="Min order PKR"
          step="0.01"
          type="number"
        />
        <input
          className="field"
          name="maximumDiscountAmount"
          placeholder="Max discount PKR"
          step="0.01"
          type="number"
        />
        <input
          className="field"
          min="0"
          name="usageLimit"
          placeholder="Usage limit"
          type="number"
        />
        <input
          className="field"
          min="0"
          name="perCustomerLimit"
          placeholder="Per customer limit"
          type="number"
        />
      </div>
      <button
        className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-stone-950 disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Creating…" : "Create draft"}
      </button>
      {message ? <p className="text-sm text-stone-400">{message}</p> : null}
    </form>
  );
}

export function CouponStatusActions({
  couponId,
  status,
}: {
  couponId: string;
  status: string;
}) {
  return (
    <div className="flex flex-col items-end gap-2">
      {status !== "ACTIVE" ? (
        <CallableActionButton
          confirm="Activate this coupon?"
          functionName="setCouponStatus"
          payload={{ id: couponId, status: "ACTIVE" }}
          successMessage="Coupon activated."
        >
          Activate
        </CallableActionButton>
      ) : null}
      {status !== "EXPIRED" ? (
        <CallableActionButton
          confirm="Mark this coupon expired?"
          functionName="setCouponStatus"
          payload={{ id: couponId, status: "EXPIRED" }}
          successMessage="Coupon expired."
        >
          Expire
        </CallableActionButton>
      ) : null}
      {status !== "ARCHIVED" ? (
        <CallableActionButton
          className="rounded-full border border-red-900 px-3 py-1.5 text-xs text-red-200"
          confirm="Archive this coupon? Customers will no longer be able to use it."
          functionName="setCouponStatus"
          payload={{ id: couponId, status: "ARCHIVED" }}
          successMessage="Coupon archived."
        >
          Archive
        </CallableActionButton>
      ) : null}
    </div>
  );
}
