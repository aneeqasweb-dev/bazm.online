"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

import { authHref } from "@/lib/auth/navigation";
import { useAuthReady } from "@/lib/auth/use-auth-ready";
import { callCommand } from "@/lib/commands/client";
import styles from "./product-reviews.module.css";

export type QuestionAccess = "customer" | "guest" | "unverified";

export function ProductQuestionForm({
  productSlug,
  productName,
  access,
}: {
  productSlug: string;
  productName: string;
  access: QuestionAccess;
}) {
  const ready = useAuthReady();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [sent, setSent] = useState(false);
  const returnPath = `/product/${productSlug}?reviewTab=questions#reviews`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || busy.current) return;
    const form = event.currentTarget;
    const message = String(new FormData(form).get("question") ?? "").trim();
    setError(undefined);
    if (message.length < 10 || message.length > 3500) {
      setError("Enter a question between 10 and 3,500 characters.");
      form.querySelector("textarea")?.focus();
      return;
    }
    busy.current = true;
    setPending(true);
    try {
      await callCommand("createSupportTicket", {
        subject: `Product question: ${productName}`.slice(0, 160),
        message: `Product: ${productName}\n/product/${productSlug}\n\n${message}`,
        relatedOrderId: null,
      });
      setSent(true);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Your question couldn’t be sent. Please try again.",
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  if (sent)
    return (
      <div className={styles.questionBox} role="status">
        <h3>Your question has been sent</h3>
        <p>
          Our team can reply in your account’s support requests. Your
          conversation stays private.
        </p>
        <Link className={styles.textLink} href="/account#support-requests">
          View my question →
        </Link>
      </div>
    );

  return (
    <div className={styles.questionBox}>
      <h3>A little more detail?</h3>
      <p>
        Ask us about the size, materials, care or availability of {productName}.
        Questions and replies stay private in your account.
      </p>
      {access !== "customer" ? (
        <Link
          className={styles.primaryButton}
          href={authHref(
            access === "unverified" ? "/verify-email" : "/login",
            returnPath,
          )}
        >
          {access === "unverified"
            ? "Verify email to ask a question"
            : "Sign in to ask a question"}
        </Link>
      ) : (
        <form method="post" onSubmit={submit} noValidate>
          <fieldset disabled={!ready || pending}>
            <label htmlFor="product-question">Your question</label>
            <textarea
              id="product-question"
              name="question"
              minLength={10}
              maxLength={3500}
              rows={4}
              required
              placeholder="What would you like to know about this piece?"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "question-error" : undefined}
            />
            {error ? (
              <p id="question-error" className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
            <button
              className={styles.primaryButton}
              type="submit"
              disabled={!ready || pending}
            >
              {pending ? "Sending your question…" : "Send question"}
            </button>
          </fieldset>
        </form>
      )}
    </div>
  );
}
