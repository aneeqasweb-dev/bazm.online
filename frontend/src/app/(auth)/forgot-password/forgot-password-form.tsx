"use client";

import Link from "next/link";
import { FirebaseError } from "firebase/app";
import { useState, type FormEvent } from "react";

import {
  AuthField,
  AuthMessage,
  AuthShell,
} from "@/components/auth/auth-shell";
import { requestPasswordReset } from "@/lib/auth/auth-client";
import { forgotPasswordSchema } from "@/lib/auth/auth-schema";
import { useAuthReady } from "@/lib/auth/use-auth-ready";
import { authHref } from "@/lib/auth/navigation";
import { getAuthErrorMessage } from "@/lib/auth/auth-errors";

export function ForgotPasswordForm({
  nextPath = "/account",
}: {
  nextPath?: string;
}) {
  const ready = useAuthReady();
  const [emailError, setEmailError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [formError, setFormError] = useState<string>();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || pending) return;
    setFormError(undefined);
    setEmailError(undefined);
    const form = new FormData(event.currentTarget);
    const parsed = forgotPasswordSchema.safeParse({ email: form.get("email") });
    if (!parsed.success) {
      setEmailError(parsed.error.issues[0]?.message);
      (
        event.currentTarget.elements.namedItem("email") as HTMLInputElement
      )?.focus();
      return;
    }

    setPending(true);
    try {
      await requestPasswordReset(parsed.data.email, nextPath);
    } catch (error) {
      // Unknown accounts get the same response; delivery failures can be retried.
      if (!(
        error instanceof FirebaseError && error.code === "auth/user-not-found"
      )) {
        setFormError(
          getAuthErrorMessage(
            error,
            "We couldn’t send the reset link. Please try again.",
          ),
        );
        setPending(false);
        return;
      }
    }
    setComplete(true);
    setPending(false);
  }

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Reset your password"
      description="Enter your email and we’ll send recovery instructions if an account exists."
    >
      {complete ? (
        <div className="mt-8 space-y-5">
          <AuthMessage kind="success">
            If an account exists for that email, a password reset link has been
            sent.
          </AuthMessage>
          <Link
            className="block text-center text-amber-300 underline"
            href={authHref("/login", nextPath)}
          >
            Return to sign in
          </Link>
        </div>
      ) : (
        <form
          className="mt-8 space-y-5"
          method="post"
          noValidate
          onSubmit={handleSubmit}
        >
          <AuthField
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            error={emailError}
          />
          <button
            className="h-12 w-full rounded-full bg-amber-300 font-semibold text-stone-950 disabled:cursor-wait disabled:opacity-60"
            disabled={!ready || pending}
            type="submit"
          >
            {pending ? "Sending…" : "Send reset link"}
          </button>
          {formError ? <AuthMessage>{formError}</AuthMessage> : null}
          <Link
            className="block text-center text-sm text-amber-300 underline"
            href={authHref("/login", nextPath)}
          >
            ← Back to sign in
          </Link>
        </form>
      )}
    </AuthShell>
  );
}
