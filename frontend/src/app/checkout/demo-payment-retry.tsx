"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { payDemoOrder } from "@/lib/payments/demo";
import styles from "./checkout.module.css";

export function DemoPaymentRetry({ orderId }: { orderId: string }) {
  const router = useRouter();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function retry() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      await payDemoOrder({ orderId });
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Please try again.");
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className={styles.primary}
        disabled={pending}
        onClick={retry}
      >
        {pending ? "Processing payment…" : "Complete demo payment"}
        {pending ? (
          <span className={styles.spinner} aria-hidden="true" />
        ) : null}
      </button>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      <p role="status" className={styles.hint}>
        {pending
          ? "Simulating payment. No money is charged."
          : "This completes your existing order."}
      </p>
    </>
  );
}
