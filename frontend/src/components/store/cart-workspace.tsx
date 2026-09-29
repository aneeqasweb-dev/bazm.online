"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { callCommand } from "@/lib/commands/client";
import { CartPanel, type CartLine } from "./cart-panel";

export function CartWorkspace({
  items,
  guest,
  needsMerge,
  checkoutHref,
}: {
  items: CartLine[];
  guest: boolean;
  needsMerge: boolean;
  checkoutHref: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!needsMerge) return;
    let current = true;
    void callCommand("mergeGuestCart", {})
      .then(() => {
        if (current) router.refresh();
      })
      .catch((error: unknown) => {
        if (current)
          setError(
            error instanceof Error
              ? error.message
              : "We couldn’t save your previous bag to your account. Please retry.",
          );
      });
    return () => {
      current = false;
    };
  }, [needsMerge, retry, router]);

  if (needsMerge && !error)
    return (
      <div
        className="mt-8 rounded-2xl border border-stone-800 bg-stone-900 p-8"
        role="status"
        aria-live="polite"
      >
        Saving your shopping bag to your account…
      </div>
    );
  return (
    <>
      {needsMerge && error ? (
        <div className="mt-6 rounded-xl border border-stone-700 p-4">
          <p role="alert" className="text-sm text-rose-200">
            {error}
          </p>
          <button
            className="mt-3 text-sm underline underline-offset-4"
            onClick={() => {
              setError(undefined);
              setRetry((value) => value + 1);
            }}
            type="button"
          >
            Retry saving your bag
          </button>
        </div>
      ) : null}
      {guest && items.length ? (
        <p className="mt-6 rounded-xl border border-stone-800 bg-stone-900 p-4 text-sm text-stone-300">
          Your bag is saved for your next visit on this browser. Sign in when
          you’re ready to check out.
        </p>
      ) : null}
      <CartPanel
        items={items}
        guest={guest}
        checkoutHref={checkoutHref}
        checkoutDisabled={needsMerge}
      />
    </>
  );
}
