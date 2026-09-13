"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import type {
  AdminInventoryHistory,
  AdminInventoryItem,
  InventoryVariantOption,
} from "@/lib/inventory/server";
import { callCommand } from "@/lib/commands/client";

type InventoryPage = { items: AdminInventoryItem[]; nextCursor: string | null };
type HistoryPage = {
  items: AdminInventoryHistory[];
  nextCursor: string | null;
};

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The inventory operation could not be completed.";
}

function pageHref(input: {
  after?: string;
  sku?: string;
  historyAfter?: string;
}) {
  const query = new URLSearchParams();
  if (input.after) query.set("after", input.after);
  if (input.sku) query.set("sku", input.sku);
  if (input.historyAfter) query.set("historyAfter", input.historyAfter);
  return `/admin/inventory${query.size ? `?${query}` : ""}`;
}

export function InventoryWorkspace({
  inventory,
  variants,
  history,
  selectedSku,
}: {
  inventory: InventoryPage;
  variants: InventoryVariantOption[];
  history: HistoryPage;
  selectedSku: string | undefined;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"ALL" | "LOW" | "OUT">("ALL");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const visibleInventory = useMemo(
    () =>
      inventory.items.filter((item) => {
        if (filter === "OUT") return item.available === 0;
        if (filter === "LOW")
          return item.available > 0 && item.available <= item.reorderPoint;
        return true;
      }),
    [filter, inventory.items],
  );

  async function receive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selected = variants.find((item) => item.sku === form.get("sku"));
    if (!selected) return setMessage("Choose a valid product variant.");
    setPending(true);
    setMessage(undefined);
    try {
      await callCommand("receiveInventory", {
        productId: selected.productId,
        variantId: selected.variantId,
        sku: selected.sku,
        quantity: Number(form.get("quantity")),
        reason: form.get("reason"),
      });
      event.currentTarget.reset();
      setMessage("Stock receipt recorded in the ledger.");
      router.refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function movement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const operation = String(form.get("operation"));
    const quantity = Number(form.get("quantity"));
    setPending(true);
    setMessage(undefined);
    try {
      const name =
        operation === "RETURN"
          ? "restoreInventoryReturn"
          : operation === "DAMAGE"
            ? "recordInventoryDamage"
            : "adjustInventory";
      const payload =
        operation === "ADJUSTMENT"
          ? {
              sku: form.get("sku"),
              delta: Number(form.get("direction")) * quantity,
              reason: form.get("reason"),
            }
          : { sku: form.get("sku"), quantity, reason: form.get("reason") };
      await callCommand(name, payload);
      event.currentTarget.reset();
      setMessage("Stock movement recorded in the ledger.");
      router.refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_23rem]">
      <section className="space-y-8">
        <div className="rounded-3xl border border-stone-800 bg-stone-900 p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold">Stock by SKU</h2>
              <p className="mt-1 text-sm text-stone-400">
                {inventory.items.length} records in this page.
              </p>
            </div>
            <select
              aria-label="Stock status filter"
              className="field mt-0"
              onChange={(event) =>
                setFilter(event.target.value as typeof filter)
              }
              value={filter}
            >
              <option value="ALL">All stock</option>
              <option value="LOW">Low stock</option>
              <option value="OUT">Out of stock</option>
            </select>
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[740px] text-left text-sm">
              <thead className="border-b border-stone-800 text-xs tracking-[0.16em] text-stone-500 uppercase">
                <tr>
                  <th className="pb-3">SKU</th>
                  <th className="pb-3">Available</th>
                  <th className="pb-3">Reserved</th>
                  <th className="pb-3">Sold</th>
                  <th className="pb-3">Return / damage</th>
                  <th className="pb-3 text-right">Ledger</th>
                </tr>
              </thead>
              <tbody>
                {visibleInventory.map((item) => (
                  <tr className="border-b border-stone-800/80" key={item.sku}>
                    <td className="py-4 font-medium">{item.sku}</td>
                    <td className="py-4">
                      {item.available}
                      {item.available <= item.reorderPoint ? (
                        <span className="ml-2 text-xs text-amber-300">low</span>
                      ) : null}
                    </td>
                    <td className="py-4">{item.reserved}</td>
                    <td className="py-4">{item.sold}</td>
                    <td className="py-4">
                      {item.returned} / {item.damaged}
                    </td>
                    <td className="py-4 text-right">
                      <Link
                        className="text-xs text-amber-300 hover:text-amber-100"
                        href={pageHref({ sku: item.sku })}
                      >
                        View history
                      </Link>
                    </td>
                  </tr>
                ))}
                {visibleInventory.length === 0 ? (
                  <tr>
                    <td className="py-8 text-center text-stone-400" colSpan={6}>
                      No matching inventory in this page.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {inventory.nextCursor ? (
            <Link
              className="mt-5 inline-flex rounded-full border border-stone-700 px-4 py-2 text-sm"
              href={pageHref({ after: inventory.nextCursor, sku: selectedSku })}
            >
              Next stock page
            </Link>
          ) : null}
        </div>

        {selectedSku ? (
          <div className="rounded-3xl border border-stone-800 bg-stone-900 p-5 sm:p-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold">
                  {selectedSku} history
                </h2>
                <p className="mt-1 text-sm text-stone-400">
                  Immutable inventory movements.
                </p>
              </div>
              <Link className="text-sm text-stone-400" href="/admin/inventory">
                Close history
              </Link>
            </div>
            <div className="mt-5 space-y-3">
              {history.items.map((entry) => (
                <article
                  className="rounded-2xl border border-stone-800 p-4"
                  key={entry.id}
                >
                  <div className="flex flex-wrap justify-between gap-2 text-sm">
                    <strong>{entry.type}</strong>
                    <span className="text-stone-400">
                      available: {entry.resultingAvailable}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-stone-300">{entry.reason}</p>
                  <p className="mt-2 text-xs text-stone-500">
                    {new Date(entry.createdAt).toLocaleString("en-PK")} · Δ{" "}
                    {entry.delta}
                  </p>
                </article>
              ))}
              {history.items.length === 0 ? (
                <p className="text-sm text-stone-400">No ledger entries yet.</p>
              ) : null}
            </div>
            {history.nextCursor ? (
              <Link
                className="mt-5 inline-flex rounded-full border border-stone-700 px-4 py-2 text-sm"
                href={pageHref({
                  sku: selectedSku,
                  historyAfter: history.nextCursor,
                })}
              >
                Next history page
              </Link>
            ) : null}
          </div>
        ) : null}
      </section>

      <aside className="space-y-8">
        <section className="rounded-3xl border border-stone-800 bg-stone-900 p-5 sm:p-7">
          <p className="text-xs tracking-[0.22em] text-amber-300 uppercase">
            Receipt
          </p>
          <h2 className="mt-2 text-2xl font-semibold">Add stock</h2>
          <form className="mt-5 space-y-3" onSubmit={receive}>
            <select className="field" name="sku" required>
              <option value="">Choose a product variant</option>
              {variants.map((variant) => (
                <option key={variant.sku} value={variant.sku}>
                  {variant.label}
                </option>
              ))}
            </select>
            <input
              className="field"
              min="1"
              name="quantity"
              placeholder="Quantity"
              required
              type="number"
            />
            <textarea
              className="field min-h-20"
              minLength={3}
              name="reason"
              placeholder="Reason for receipt"
              required
            />
            <button
              className="w-full rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-stone-950 disabled:opacity-50"
              disabled={pending}
              type="submit"
            >
              Record receipt
            </button>
          </form>
        </section>
        <section className="rounded-3xl border border-stone-800 bg-stone-900 p-5 sm:p-7">
          <p className="text-xs tracking-[0.22em] text-amber-300 uppercase">
            Movement
          </p>
          <h2 className="mt-2 text-2xl font-semibold">Adjust stock</h2>
          <form className="mt-5 space-y-3" onSubmit={movement}>
            <select
              className="field"
              defaultValue="ADJUSTMENT"
              name="operation"
            >
              <option value="ADJUSTMENT">Manual adjustment</option>
              <option value="RETURN">Customer return</option>
              <option value="DAMAGE">Damaged stock</option>
            </select>
            <select className="field" name="sku" required>
              <option value="">Choose stocked SKU</option>
              {inventory.items.map((item) => (
                <option key={item.sku} value={item.sku}>
                  {item.sku}
                </option>
              ))}
            </select>
            <select className="field" defaultValue="1" name="direction">
              <option value="1">Increase (adjustment only)</option>
              <option value="-1">Decrease (adjustment only)</option>
            </select>
            <input
              className="field"
              min="1"
              name="quantity"
              placeholder="Quantity"
              required
              type="number"
            />
            <textarea
              className="field min-h-20"
              minLength={3}
              name="reason"
              placeholder="Reason for movement"
              required
            />
            <button
              className="w-full rounded-full border border-stone-700 px-5 py-3 text-sm disabled:opacity-50"
              disabled={pending}
              type="submit"
            >
              Record movement
            </button>
          </form>
        </section>
        {message ? (
          <p
            aria-live="polite"
            className="rounded-2xl border border-stone-700 bg-stone-900 p-4 text-sm text-stone-200"
          >
            {message}
          </p>
        ) : null}
      </aside>
    </div>
  );
}
