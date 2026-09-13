"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatPkr } from "@/components/store/product-card";
import { callCommand } from "@/lib/commands/client";

export type CartLine = {
  variantId: string;
  requestedQuantity: number;
  snapshot: {
    name: string;
    slug: string;
    brand: string;
    image: { url: string; alt: string };
    price: { amountMinor: number; currency: "PKR" };
    sku: string;
    color: string;
    size: string;
  };
};

export function CartPanel({ items }: { items: CartLine[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string>();
  const [message, setMessage] = useState<string>();
  const subtotal = items.reduce(
    (total, item) =>
      total + item.snapshot.price.amountMinor * item.requestedQuantity,
    0,
  );
  async function mutate(
    name: "updateCartItem" | "removeCartItem" | "moveCartItemToWishlist",
    variantId: string,
    quantity?: number,
  ) {
    setPendingId(variantId);
    setMessage(undefined);
    try {
      await callCommand(
        name,
        quantity === undefined ? { variantId } : { variantId, quantity },
      );
      router.refresh();
    } catch {
      setMessage("Your cart changed. Refresh and try that action again.");
    } finally {
      setPendingId(undefined);
    }
  }
  if (!items.length) {
    return (
      <div className="mt-8 rounded-2xl border border-dashed border-stone-700 p-8">
        <p className="text-stone-300">Your cart is empty.</p>
        <Link
          className="mt-4 inline-flex rounded-full bg-amber-300 px-5 py-3 font-semibold text-stone-950"
          href="/shop"
        >
          Continue shopping
        </Link>
      </div>
    );
  }
  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem]">
      <section aria-label="Cart items" className="grid gap-4">
        {items.map((item) => (
          <article
            className="grid gap-4 rounded-2xl border border-stone-800 bg-stone-900 p-4 sm:grid-cols-[7rem_1fr]"
            key={item.variantId}
          >
            <Link
              className="relative aspect-[3/4] overflow-hidden rounded-xl bg-stone-800"
              href={`/product/${item.snapshot.slug}`}
            >
              <Image
                alt={item.snapshot.image.alt}
                className="object-cover"
                fill
                quality={60}
                sizes="112px"
                src={item.snapshot.image.url}
              />
            </Link>
            <div>
              <p className="text-xs tracking-[0.16em] text-stone-400 uppercase">
                {item.snapshot.brand}
              </p>
              <Link
                className="mt-1 block text-lg font-semibold hover:text-amber-100"
                href={`/product/${item.snapshot.slug}`}
              >
                {item.snapshot.name}
              </Link>
              <p className="mt-1 text-sm text-stone-400">
                {item.snapshot.color} · {item.snapshot.size} ·{" "}
                {item.snapshot.sku}
              </p>
              <p className="mt-3 text-amber-200">
                {formatPkr(item.snapshot.price.amountMinor)} each
              </p>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label
                  className="w-24 text-sm text-stone-300"
                  htmlFor={`quantity-${item.variantId}`}
                >
                  Quantity
                  <input
                    className="field"
                    defaultValue={item.requestedQuantity}
                    disabled={pendingId === item.variantId}
                    id={`quantity-${item.variantId}`}
                    max="999"
                    min="1"
                    onChange={(event) => {
                      const quantity = Number(event.target.value);
                      if (
                        Number.isInteger(quantity) &&
                        quantity >= 1 &&
                        quantity <= 999
                      )
                        void mutate("updateCartItem", item.variantId, quantity);
                    }}
                    type="number"
                  />
                </label>
                <button
                  className="text-sm text-stone-300 underline underline-offset-4 hover:text-white disabled:opacity-50"
                  disabled={pendingId === item.variantId}
                  onClick={() =>
                    void mutate("moveCartItemToWishlist", item.variantId)
                  }
                  type="button"
                >
                  Move to wishlist
                </button>
                <button
                  className="text-sm text-rose-200 underline underline-offset-4 hover:text-rose-100 disabled:opacity-50"
                  disabled={pendingId === item.variantId}
                  onClick={() => void mutate("removeCartItem", item.variantId)}
                  type="button"
                >
                  Remove
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>
      <aside className="h-fit rounded-2xl border border-stone-800 bg-stone-900 p-6">
        <h2 className="text-xl font-semibold">Order summary</h2>
        <dl className="mt-5 grid gap-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-stone-400">Subtotal</dt>
            <dd>{formatPkr(subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-stone-400">Shipping</dt>
            <dd>Calculated at checkout</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-stone-400">Discount</dt>
            <dd>Applied at checkout</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-stone-700 pt-3 text-base font-semibold">
            <dt>Estimated total</dt>
            <dd>{formatPkr(subtotal)}</dd>
          </div>
        </dl>
        <Link
          className="mt-6 w-full rounded-full bg-amber-300 px-5 py-3 font-semibold text-stone-950"
          href="/checkout"
        >
          Continue to checkout
        </Link>
        <Link
          className="mt-4 block text-center text-sm text-stone-300 underline underline-offset-4"
          href="/shop"
        >
          Continue shopping
        </Link>
        {message ? (
          <p aria-live="polite" className="mt-4 text-sm text-amber-200">
            {message}
          </p>
        ) : null}
      </aside>
    </div>
  );
}
