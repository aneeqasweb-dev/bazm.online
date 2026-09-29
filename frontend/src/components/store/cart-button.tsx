"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { callCommand } from "@/lib/commands/client";
import styles from "./product-reviews.module.css";

export function CartButton({
  productId,
  variantId,
  quantity,
  disabled,
  compact = false,
}: {
  productId: string;
  variantId: string;
  quantity: number;
  disabled: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"cart" | "checkout" | null>(null);
  const [message, setMessage] = useState<string>();
  const busy = useRef(false);
  async function add(destination: "cart" | "checkout") {
    if (busy.current || disabled) return;
    busy.current = true;
    setPending(destination);
    setMessage(undefined);
    try {
      await callCommand("addCartItem", {
        productId,
        variantId,
        quantity,
      });
      router.push(destination === "checkout" ? "/checkout" : "/cart");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "This option could not be added. Please try again.",
      );
      busy.current = false;
      setPending(null);
    }
  }
  return (
    <div className="w-full">
      <div
        className={compact ? undefined : "grid gap-3 sm:grid-cols-2"}
        aria-label="Purchase options"
      >
        <button
          className={
            compact
              ? `${styles.primaryButton} ${styles.cartAction}`
              : "min-h-12 rounded-full border border-stone-700 px-6 py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          }
          disabled={disabled || pending !== null}
          onClick={() => void add("cart")}
          type="button"
        >
          {pending === "cart"
            ? "Adding…"
            : compact
              ? "Add to cart"
              : `Add ${quantity} to cart`}
        </button>
        {!compact ? (
          <button
            className="inline-flex min-h-12 items-center justify-center gap-3 rounded-full bg-amber-300 px-6 py-3 font-semibold text-stone-950 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled || pending !== null}
            onClick={() => void add("checkout")}
            type="button"
          >
            {pending === "checkout" ? "Opening checkout…" : "Buy it now"}
            <span aria-hidden="true">→</span>
          </button>
        ) : null}
      </div>
      {message ? (
        <p role="alert" className="mt-2 text-sm text-rose-200">
          {message}
        </p>
      ) : null}
    </div>
  );
}
