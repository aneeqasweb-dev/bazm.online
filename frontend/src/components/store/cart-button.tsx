"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { callCommand } from "@/lib/commands/client";

export function CartButton({
  productId,
  variantId,
  quantity,
  disabled,
}: {
  productId: string;
  variantId: string;
  quantity: number;
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  async function add() {
    setPending(true);
    setMessage(undefined);
    try {
      await callCommand("addCartItem", {
        productId,
        variantId,
        quantity,
      });
      router.push("/cart");
      router.refresh();
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String(error.code)
          : "";
      setMessage(
        code.includes("unauthenticated")
          ? "Sign in to add this piece to your cart."
          : "This option could not be added. Refresh and try again.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div>
      <button
        className="rounded-full bg-amber-300 px-6 py-3 font-semibold text-stone-950 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled || pending}
        onClick={add}
        type="button"
      >
        {pending ? "Adding…" : `Add ${quantity} to cart`}
      </button>
      {message ? (
        <p aria-live="polite" className="mt-2 text-sm text-amber-200">
          {message}
        </p>
      ) : null}
    </div>
  );
}
