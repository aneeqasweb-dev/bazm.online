"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import {
  AuthField,
  AuthMessage,
  AuthShell,
} from "@/components/auth/auth-shell";
import {
  inspectPasswordResetCode,
  resetPassword,
} from "@/lib/auth/auth-client";
import { getAuthErrorMessage } from "@/lib/auth/auth-errors";
import { resetPasswordSchema } from "@/lib/auth/auth-schema";

type ResetErrors = Partial<Record<"password" | "confirmPassword", string>>;

export function ResetPasswordClient({ code }: { code?: string }) {
  const [state, setState] = useState<
    "checking" | "ready" | "submitting" | "complete" | "invalid"
  >(code ? "checking" : "invalid");
  const [email, setEmail] = useState<string>();
  const [errors, setErrors] = useState<ResetErrors>({});
  const [formError, setFormError] = useState<string | undefined>(
    code ? undefined : "This reset link is incomplete. Request a new one.",
  );

  useEffect(() => {
    if (!code) return;
    let current = true;
    inspectPasswordResetCode(code)
      .then((accountEmail) => {
        if (!current) return;
        setEmail(accountEmail);
        setState("ready");
      })
      .catch((error: unknown) => {
        if (!current) return;
        setFormError(
          getAuthErrorMessage(
            error,
            "This reset link is invalid. Request a new one.",
          ),
        );
        setState("invalid");
      });
    return () => {
      current = false;
    };
  }, [code]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!code) return;
    setErrors({});
    setFormError(undefined);
    const form = new FormData(event.currentTarget);
    const parsed = resetPasswordSchema.safeParse({
      password: form.get("password"),
      confirmPassword: form.get("confirmPassword"),
    });
    if (!parsed.success) {
      const nextErrors: ResetErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof ResetErrors;
        nextErrors[field] ??= issue.message;
      }
      setErrors(nextErrors);
      return;
    }

    setState("submitting");
    try {
      await resetPassword(code, parsed.data.password);
      setState("complete");
    } catch (error) {
      setFormError(
        getAuthErrorMessage(
          error,
          "We could not reset the password. Try again.",
        ),
      );
      setState("invalid");
    }
  }

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Choose a new password"
      description={
        email
          ? `Resetting the password for ${email}.`
          : "Checking your recovery link."
      }
    >
      <div className="mt-8">
        {state === "checking" ? (
          <AuthMessage kind="info">Checking your reset link…</AuthMessage>
        ) : null}
        {formError ? <AuthMessage>{formError}</AuthMessage> : null}
        {state === "complete" ? (
          <div className="space-y-5">
            <AuthMessage kind="success">
              Your password has been updated.
            </AuthMessage>
            <Link
              className="inline-flex h-12 w-full items-center justify-center rounded-full bg-amber-300 font-semibold text-stone-950"
              href="/login?reset=complete"
            >
              Sign in
            </Link>
          </div>
        ) : null}
        {state === "invalid" ? (
          <Link
            className="mt-5 block text-center text-amber-300 underline"
            href="/forgot-password"
          >
            Request a new reset link
          </Link>
        ) : null}
        {state === "ready" || state === "submitting" ? (
          <form
            className="space-y-5"
            method="post"
            noValidate
            onSubmit={handleSubmit}
          >
            <AuthField
              label="New password"
              name="password"
              type="password"
              autoComplete="new-password"
              error={errors.password}
              hint="At least 8 characters with uppercase, lowercase, and a number."
            />
            <AuthField
              label="Confirm new password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              error={errors.confirmPassword}
            />
            <button
              className="h-12 w-full rounded-full bg-amber-300 font-semibold text-stone-950 disabled:cursor-wait disabled:opacity-60"
              disabled={state === "submitting"}
              type="submit"
            >
              {state === "submitting" ? "Updating…" : "Update password"}
            </button>
          </form>
        ) : null}
      </div>
    </AuthShell>
  );
}
