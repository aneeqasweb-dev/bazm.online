"use client";

import { FirebaseError } from "firebase/app";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

import { formatPkr } from "@/components/store/product-card";
import { callCommand } from "@/lib/commands/client";

type Order = {
  id: string;
  status: string;
  isDemo?: boolean;
  totals: { grandTotal: { amountMinor: number } };
  placedAt: string;
  trackingNumber: string | null;
  items: {
    productId: string;
    variantId: string;
    productName: string;
    sku: string;
    quantity: number;
    lineTotal: { amountMinor: number };
  }[];
  returns: {
    id: string;
    status: string;
    items: {
      orderItemId: string;
      variantId: string;
      sku: string;
      quantity: number;
      reason: string;
    }[];
    customerNote: string | null;
    policyVersion: string;
    refundAmount: { amountMinor: number } | null;
    requestedAt: string;
  }[];
};

type ReturnPolicy = {
  version: string;
  windowDays: number;
  eligibleStatuses: string[];
  reasons: string[];
};

const activeReturnStatuses = new Set([
  "REQUESTED",
  "APPROVED",
  "RECEIVED",
  "REFUNDED",
]);

function errorMessage(error: unknown) {
  return error instanceof FirebaseError
    ? error.message.replace(/^.*?:\s*/, "")
    : error instanceof Error
      ? error.message
      : "The return request could not be submitted.";
}

function returnWindowEndsAt(order: Order, policy: ReturnPolicy) {
  return new Date(
    new Date(order.placedAt).getTime() + policy.windowDays * 86_400_000,
  );
}

function returnedQuantity(order: Order, variantId: string) {
  return order.returns
    .filter((returnRequest) => activeReturnStatuses.has(returnRequest.status))
    .flatMap((returnRequest) => returnRequest.items)
    .filter((item) => item.variantId === variantId)
    .reduce((total, item) => total + item.quantity, 0);
}

export function OrderHistory({
  orders,
  returnPolicy,
}: {
  orders: Order[];
  returnPolicy: ReturnPolicy;
}) {
  const router = useRouter();
  const [renderedAt] = useState(() => Date.now());
  const [pending, setPending] = useState<string>();
  const [returnPending, setReturnPending] = useState<string>();
  const [messages, setMessages] = useState<Record<string, string>>({});
  const reasons = useMemo(
    () => (returnPolicy.reasons.length ? returnPolicy.reasons : ["Wrong size"]),
    [returnPolicy.reasons],
  );

  function setOrderMessage(orderId: string, message: string) {
    setMessages((current) => ({ ...current, [orderId]: message }));
  }

  async function cancel(orderId: string) {
    setPending(orderId);
    try {
      await callCommand("cancelMyOrder", { orderId });
      router.refresh();
    } finally {
      setPending(undefined);
    }
  }

  async function requestReturn(
    order: Order,
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const items = order.items
      .map((item, index) => ({
        orderItemId: item.variantId,
        quantity: Number(form.get(`quantity-${index}`) ?? 0),
        reason: String(form.get(`reason-${index}`) ?? "").trim(),
      }))
      .filter((item) => item.quantity > 0);
    if (!items.length) {
      setOrderMessage(order.id, "Choose at least one item quantity to return.");
      return;
    }

    setReturnPending(order.id);
    setOrderMessage(order.id, "");
    try {
      await callCommand("createReturn", {
        orderId: order.id,
        items,
        customerNote: String(form.get("customerNote") ?? "").trim() || null,
      });
      event.currentTarget.reset();
      setOrderMessage(order.id, "Return request submitted.");
      router.refresh();
    } catch (error) {
      setOrderMessage(order.id, errorMessage(error));
    } finally {
      setReturnPending(undefined);
    }
  }

  return (
    <section className="mt-10 border-t border-stone-800 pt-8">
      <h2 className="text-2xl font-semibold">Order history</h2>
      {orders.length ? (
        <div className="mt-4 grid gap-3">
          {orders.map((order) => (
            <article
              className="rounded-2xl border border-stone-800 p-4"
              key={order.id}
            >
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="font-medium">
                    Order {order.id.slice(-8).toUpperCase()}
                  </p>
                  <p className="mt-1 text-sm text-stone-400">
                    {order.items
                      .map((item) => `${item.productName} × ${item.quantity}`)
                      .join(", ")}
                  </p>
                  {order.trackingNumber ? (
                    <p className="mt-2 text-sm text-amber-200">
                      Tracking: {order.trackingNumber}
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-amber-200">
                    {formatPkr(order.totals.grandTotal.amountMinor)}
                  </p>
                  <p className="text-xs text-stone-400">
                    {order.status.replaceAll("_", " ")}
                  </p>
                </div>
              </div>
              {order.returns.length ? (
                <div className="mt-4 rounded-2xl bg-stone-950/60 p-3 text-sm text-stone-300">
                  <p className="font-medium text-stone-100">Return tracking</p>
                  <div className="mt-2 grid gap-2">
                    {order.returns.map((returnRequest) => (
                      <div key={returnRequest.id}>
                        <p>
                          Return {returnRequest.id.slice(-8).toUpperCase()} ·{" "}
                          {returnRequest.status.replaceAll("_", " ")}
                        </p>
                        <p className="text-xs text-stone-500">
                          {returnRequest.items
                            .map(
                              (item) =>
                                `${item.sku} × ${item.quantity} · ${item.reason}`,
                            )
                            .join(", ")}
                        </p>
                        <p className="text-xs text-stone-500">
                          Policy {returnRequest.policyVersion}
                          {returnRequest.refundAmount
                            ? ` · eligible refund ${formatPkr(
                                returnRequest.refundAmount.amountMinor,
                              )}`
                            : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {order.isDemo ? (
                <Link
                  className="mt-4 inline-block text-sm text-amber-300 underline underline-offset-4"
                  href={`/checkout/confirmation/${order.id}`}
                >
                  {order.status === "PENDING_PAYMENT"
                    ? "Complete demo payment"
                    : "View demo payment receipt"}
                </Link>
              ) : null}
              {order.status === "PENDING_PAYMENT" ? (
                <button
                  className="mt-4 text-sm text-rose-200 underline disabled:opacity-50"
                  disabled={pending === order.id}
                  onClick={() => void cancel(order.id)}
                  type="button"
                >
                  Cancel unpaid order
                </button>
              ) : null}
              {returnPolicy.eligibleStatuses.includes(order.status) &&
              returnWindowEndsAt(order, returnPolicy).getTime() >=
                renderedAt ? (
                <form
                  className="mt-4 grid gap-3 rounded-2xl border border-stone-800 bg-stone-950/40 p-3"
                  onSubmit={(event) => void requestReturn(order, event)}
                >
                  <div>
                    <p className="text-sm font-medium text-stone-100">
                      Request a return
                    </p>
                    <p className="text-xs text-stone-500">
                      Window closes{" "}
                      {returnWindowEndsAt(
                        order,
                        returnPolicy,
                      ).toLocaleDateString("en-PK")}{" "}
                      · policy {returnPolicy.version}
                    </p>
                  </div>
                  <div className="grid gap-2">
                    {order.items.map((item, index) => {
                      const remaining =
                        item.quantity - returnedQuantity(order, item.variantId);
                      return (
                        <div
                          className="grid gap-2 rounded-xl border border-stone-800 p-3 sm:grid-cols-[1fr_96px_150px]"
                          key={`${order.id}-${item.variantId}`}
                        >
                          <div>
                            <p className="text-sm">{item.productName}</p>
                            <p className="text-xs text-stone-500">
                              {item.sku} · {remaining} returnable
                            </p>
                          </div>
                          <input
                            aria-label={`Return quantity for ${item.productName}`}
                            className="field mt-0"
                            disabled={remaining <= 0}
                            max={remaining}
                            min={0}
                            name={`quantity-${index}`}
                            placeholder="Qty"
                            type="number"
                          />
                          <select
                            aria-label={`Return reason for ${item.productName}`}
                            className="field mt-0"
                            disabled={remaining <= 0}
                            name={`reason-${index}`}
                          >
                            {reasons.map((reason) => (
                              <option key={reason} value={reason}>
                                {reason}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                  <textarea
                    className="field mt-0 min-h-24"
                    name="customerNote"
                    placeholder="Add a short description for our team"
                  />
                  <button
                    className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-stone-950 disabled:opacity-60"
                    disabled={returnPending === order.id}
                    type="submit"
                  >
                    {returnPending === order.id
                      ? "Submitting…"
                      : "Submit return request"}
                  </button>
                  {messages[order.id] ? (
                    <p className="text-xs text-stone-400">
                      {messages[order.id]}
                    </p>
                  ) : null}
                </form>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-stone-400">
          You have not placed an order yet.
        </p>
      )}
    </section>
  );
}
