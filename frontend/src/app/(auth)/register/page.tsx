"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import {
  AuthField,
  AuthMessage,
  AuthShell,
} from "@/components/auth/auth-shell";
import {
  getRegistrationErrorMessage,
  registerCustomer,
} from "@/lib/auth/register-customer";
import { registrationSchema } from "@/lib/auth/registration-schema";
import { useAuthReady } from "@/lib/auth/use-auth-ready";

type FieldErrors = Partial<
  Record<"name" | "email" | "password" | "confirmPassword", string>
>;

export default function RegisterPage() {
  const ready = useAuthReady();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [status, setStatus] = useState<"idle" | "submitting" | "complete">(
    "idle",
  );
  const [verificationSent, setVerificationSent] = useState(false);
  const [email, setEmail] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || status !== "idle") return;
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
      const firstField = event.currentTarget.elements.namedItem(
        Object.keys(errors)[0],
      );
      if (firstField instanceof HTMLElement) firstField.focus();
      return;
    }
    setStatus("submitting");
    try {
      const result = await registerCustomer(parsed.data);
      setEmail(parsed.data.email);
      setVerificationSent(result.verificationSent);
      setStatus("complete");
    } catch (error) {
      setFormError(getRegistrationErrorMessage(error));
      setStatus("idle");
    }
  }

  if (status === "complete") {
    return (
      <AuthShell
        eyebrow="Welcome to Bazm"
        title="You’re almost there"
        description="Your account is created. Verify your email to finish setting it up."
      >
        <div className="mt-6 space-y-5">
          <AuthMessage kind={verificationSent ? "success" : "info"}>
            {verificationSent ? (
              <>
                We sent a verification link to{" "}
                <strong className="break-all">{email}</strong>. Open the email
                and tap the link.
              </>
            ) : (
              "Your account is saved, but we couldn’t send the verification email. Request a new link below."
            )}
          </AuthMessage>
          <p className="text-sm leading-6 text-stone-400">
            Can’t find it? Check your spam or junk folder. You can also resend
            the email on the next page.
          </p>
          <Link
            className="inline-flex h-12 w-full items-center justify-center bg-amber-300 font-semibold text-stone-950"
            href="/verify-email"
          >
            Continue to verification
          </Link>
          <Link
            className="block text-center text-sm text-amber-300 underline"
            href="/shop"
          >
            Keep browsing
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      activeTab="register"
      eyebrow="Make yourself at home"
      title="Create your account"
      description="Save your favourites, check out faster and follow your orders."
    >
      <form
        className="mt-6 space-y-4"
        method="post"
        noValidate
        onSubmit={handleSubmit}
      >
        <AuthField
          label="Full name"
          name="name"
          autoComplete="name"
          placeholder="Your full name"
          error={fieldErrors.name}
        />
        <AuthField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          error={fieldErrors.email}
        />
        <AuthField
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          error={fieldErrors.password}
          hint="Use 8+ characters, with a capital letter, a lowercase letter and a number."
        />
        <AuthField
          label="Confirm password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          error={fieldErrors.confirmPassword}
          placeholder="Enter your password again"
        />
        {formError ? <AuthMessage>{formError}</AuthMessage> : null}
        <button
          className="h-12 w-full bg-amber-300 font-semibold text-stone-950 disabled:cursor-wait disabled:opacity-60"
          disabled={!ready || status === "submitting"}
          type="submit"
        >
          {status === "submitting"
            ? "Creating your account…"
            : "Create account"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-stone-400">
        Already have an account?{" "}
        <Link className="text-amber-300 underline" href="/login">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
