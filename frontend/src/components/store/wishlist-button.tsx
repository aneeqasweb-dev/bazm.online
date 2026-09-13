"use client";

import { useState } from "react";

import { callCommand } from "@/lib/commands/client";

export function WishlistButton({
  productId,
  saved = false,
}: {
  productId: string;
  saved?: boolean;
}) {
  const [active, setActive] = useState(saved);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  async function toggle() {
    setPending(true);
    setMessage(undefined);
    try {
      await callCommand(active ? "removeWishlistItem" : "addWishlistItem", {
        productId,
      });
      setActive(!active);
    } catch {
      setMessage("Sign in to update your wishlist.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div>
      <button
        aria-pressed={active}
        className="rounded-full border border-stone-700 px-6 py-3 font-semibold disabled:opacity-50"
        disabled={pending}
        onClick={toggle}
        type="button"
      >
        {pending ? "Saving…" : active ? "Saved" : "Save to wishlist"}
      </button>
      {message ? (
        <p aria-live="polite" className="mt-2 text-sm text-amber-200">
          {message}
        </p>
      ) : null}
    </div>
  );
}
