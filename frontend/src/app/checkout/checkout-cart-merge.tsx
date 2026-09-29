"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { callCommand } from "@/lib/commands/client";
import styles from "./checkout.module.css";

export function CheckoutCartMerge() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
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
              : "Your bag could not be saved. Please retry.",
          );
      });
    return () => {
      current = false;
    };
  }, [retry, router]);

  return (
    <main className={styles.status}>
      <p className={styles.eyebrow}>Your checkout</p>
      <h1>Getting your bag ready.</h1>
      {error ? (
        <>
          <p role="alert" className={styles.error}>
            {error}
          </p>
          <button
            className={styles.primary}
            type="button"
            onClick={() => {
              setError(undefined);
              setRetry((value) => value + 1);
            }}
          >
            Try again
          </button>
          <Link className={styles.backLink} href="/cart">
            Review your shopping bag
          </Link>
        </>
      ) : (
        <p role="status">
          Saving your items to your account. Checkout will open in a moment…
        </p>
      )}
    </main>
  );
}
