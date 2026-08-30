"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import {
  getRegistrationErrorMessage,
  registerCustomer,
} from "@/lib/auth/register-customer";
import { registrationSchema } from "@/lib/auth/registration-schema";

type FieldErrors = Partial<
  Record<"name" | "email" | "password" | "confirmPassword", string>
>;

export default function RegisterPage() {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [status, setStatus] = useState<"idle" | "submitting" | "complete">(
    "idle",
  );
  const [verificationSent, setVerificationSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    setFieldErrors({});

    const form = new FormData(event.currentTarget);
    const parsed = registrationSchema.safeParse({
      name: form.get("name"),
      email: form.get("email"),
      password: form.get("password"),
      confirmPassword: form.get("confirmPassword"),
    });

    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof FieldErrors;
        errors[field] ??= issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setStatus("submitting");
    try {
      const result = await registerCustomer(parsed.data);
      setVerificationSent(result.verificationSent);
      setStatus("complete");
    } catch (error) {
      setFormError(getRegistrationErrorMessage(error));
      setStatus("idle");
    }
  }

  if (status === "complete") {
    return (
      <main className="grid min-h-screen place-items-center bg-stone-950 px-6 text-stone-50">
        <section className="w-full max-w-lg rounded-3xl border border-stone-800 bg-stone-900 p-8">
          <p className="text-sm tracking-[0.28em] text-amber-300 uppercase">
            Welcome to Bazm
          </p>
          <h1 className="mt-4 text-4xl font-semibold">
            Your account is ready.
          </h1>
          <p className="mt-4 leading-7 text-stone-300" role="status">
            {verificationSent
              ? "We sent a verification link to your email address. Verify it before continuing."
              : "Your account was created, but the verification email could not be sent. You can resend it from your account."}
          </p>
          <Link
            className="mt-8 inline-block font-medium text-amber-300 underline"
            href="/verify-email"
          >
            Continue to verification
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-stone-950 px-6 py-12 text-stone-50">
      <section className="w-full max-w-lg">
        <Link className="text-sm text-stone-400 hover:text-stone-100" href="/">
          ← Back to Bazm
        </Link>
        <h1 className="mt-8 text-4xl font-semibold tracking-tight">
          Create your account
        </h1>
        <p className="mt-3 text-stone-400">
          Save favourites, checkout faster, and track every order.
        </p>

        <form className="mt-8 space-y-5" noValidate onSubmit={handleSubmit}>
          <Field
            label="Full name"
            name="name"
            autoComplete="name"
            error={fieldErrors.name}
          />
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            error={fieldErrors.email}
          />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            error={fieldErrors.password}
            hint="At least 8 characters with uppercase, lowercase, and a number."
          />
          <Field
            label="Confirm password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            error={fieldErrors.confirmPassword}
          />

          {formError ? (
            <p
              className="rounded-xl bg-red-950 p-3 text-sm text-red-200"
              role="alert"
            >
              {formError}
            </p>
          ) : null}
          <button
            className="h-12 w-full rounded-full bg-amber-300 font-semibold text-stone-950 disabled:cursor-wait disabled:opacity-60"
            disabled={status === "submitting"}
            type="submit"
          >
            {status === "submitting" ? "Creating account…" : "Create account"}
          </button>
        </form>
        <p className="mt-8 text-center text-sm text-stone-400">
          Already registered?{" "}
          <Link className="text-amber-300 underline" href="/login">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}

function Field({
  label,
  name,
  type = "text",
  autoComplete,
  error,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete: string;
  error?: string;
  hint?: string;
}) {
  const descriptionId = `${name}-description`;
  return (
    <div>
      <label className="mb-2 block text-sm font-medium" htmlFor={name}>
        {label}
      </label>
      <input
        aria-describedby={error || hint ? descriptionId : undefined}
        aria-invalid={Boolean(error)}
        autoComplete={autoComplete}
        className="h-12 w-full rounded-xl border border-stone-700 bg-stone-900 px-4 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-300/20"
        id={name}
        name={name}
        type={type}
      />
      {error ? (
        <p className="mt-2 text-sm text-red-300" id={descriptionId}>
          {error}
        </p>
      ) : hint ? (
        <p className="mt-2 text-sm text-stone-500" id={descriptionId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
