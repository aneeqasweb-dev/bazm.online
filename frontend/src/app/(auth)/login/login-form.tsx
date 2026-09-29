"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  AuthField,
  AuthMessage,
  AuthShell,
} from "@/components/auth/auth-shell";
import {
  isGoogleAuthEnabled,
  loginWithEmail,
  loginWithGoogle,
} from "@/lib/auth/auth-client";
import { getAuthErrorMessage } from "@/lib/auth/auth-errors";
import { loginSchema } from "@/lib/auth/auth-schema";
import { useAuthReady } from "@/lib/auth/use-auth-ready";
import { authHref } from "@/lib/auth/navigation";

type LoginFieldErrors = Partial<Record<"email" | "password", string>>;

export function LoginForm({
  nextPath,
  reason,
  resetComplete,
}: {
  nextPath: string;
  reason?: string;
  resetComplete: boolean;
}) {
  const router = useRouter();
  const ready = useAuthReady();
  const [errors, setErrors] = useState<LoginFieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [pending, setPending] = useState<"email" | "google" | null>(null);

  async function finishLogin(action: () => ReturnType<typeof loginWithEmail>) {
    try {
      const result = await action();
      router.replace(
        result.emailVerified ? nextPath : authHref("/verify-email", nextPath),
      );
      router.refresh();
    } catch (error) {
      setFormError(
        getAuthErrorMessage(
          error,
          "We could not sign you in. Check your details and try again.",
        ),
      );
      setPending(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || pending !== null) return;
    setErrors({});
    setFormError(undefined);
    const form = new FormData(event.currentTarget);
    const parsed = loginSchema.safeParse({
      email: form.get("email"),
      password: form.get("password"),
    });
    if (!parsed.success) {
      const nextErrors: LoginFieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof LoginFieldErrors;
        nextErrors[field] ??= issue.message;
      }
      setErrors(nextErrors);
      const firstField = event.currentTarget.elements.namedItem(
        Object.keys(nextErrors)[0],
      );
      if (firstField instanceof HTMLElement) firstField.focus();
      return;
    }

    setPending("email");
    await finishLogin(() => loginWithEmail(parsed.data));
  }

  async function handleGoogleLogin() {
    if (!ready || pending !== null) return;
    setFormError(undefined);
    setPending("google");
    await finishLogin(loginWithGoogle);
  }

  return (
    <AuthShell
      activeTab="login"
      nextPath={nextPath}
      eyebrow="Your account"
      title="Welcome back"
      description={
        nextPath === "/checkout"
          ? "Sign in to finish your order. Your shopping bag is saved."
          : "Sign in with your email and password to pick up where you left off."
      }
    >
      <div className="space-y-3 empty:hidden [&:not(:empty)]:mt-6">
        {reason === "session-expired" ? (
          <AuthMessage kind="info">
            Your session ended. Sign in again to continue.
          </AuthMessage>
        ) : null}
        {reason === "disabled" ? (
          <AuthMessage>
            This account is disabled. Contact support for assistance.
          </AuthMessage>
        ) : null}
        {resetComplete ? (
          <AuthMessage kind="success">
            Your password was changed. Sign in with the new password.
          </AuthMessage>
        ) : null}
      </div>

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
          error={errors.email}
        />
        <AuthField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          error={errors.password}
        />
        <div className="text-right">
          <Link
            className="text-sm text-amber-300 underline"
            href={authHref("/forgot-password", nextPath)}
          >
            Forgot password?
          </Link>
        </div>
        {formError ? <AuthMessage>{formError}</AuthMessage> : null}
        <button
          className="h-12 w-full rounded-full bg-amber-300 font-semibold text-stone-950 disabled:cursor-wait disabled:opacity-60"
          disabled={!ready || pending !== null}
          type="submit"
        >
          {pending === "email" ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {isGoogleAuthEnabled() ? (
        <button
          className="mt-3 h-12 w-full rounded-full border border-stone-700 font-semibold disabled:cursor-wait disabled:opacity-60"
          disabled={!ready || pending !== null}
          onClick={handleGoogleLogin}
          type="button"
        >
          {pending === "google" ? "Connecting…" : "Continue with Google"}
        </button>
      ) : null}

      <p className="mt-8 text-center text-sm text-stone-400">
        New to Bazm?{" "}
        <Link
          className="text-amber-300 underline"
          href={authHref("/register", nextPath)}
        >
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
