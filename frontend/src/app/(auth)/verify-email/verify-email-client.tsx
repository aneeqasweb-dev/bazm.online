"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AuthMessage, AuthShell } from "@/components/auth/auth-shell";
import {
  applyEmailVerificationCode,
  sendVerificationEmail,
} from "@/lib/auth/auth-client";
import { getAuthErrorMessage } from "@/lib/auth/auth-errors";

type VerificationState =
  "ready" | "applying" | "verified" | "sending" | "sent" | "error";

export function VerifyEmailClient({ code }: { code?: string }) {
  const [state, setState] = useState<VerificationState>(
    code ? "applying" : "ready",
  );
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    if (!code) return;
    let current = true;
    applyEmailVerificationCode(code)
      .then(() => {
        if (current) setState("verified");
      })
      .catch((error: unknown) => {
        if (!current) return;
        setMessage(
          getAuthErrorMessage(
            error,
            "We could not verify this email. Request a new link.",
          ),
        );
        setState("error");
      });
    return () => {
      current = false;
    };
  }, [code]);

  async function resend() {
    setState("sending");
    setMessage(undefined);
    try {
      await sendVerificationEmail();
      setState("sent");
    } catch (error) {
      setMessage(
        getAuthErrorMessage(
          error,
          "Sign in again, then request a new verification email.",
        ),
      );
      setState("error");
    }
  }

  return (
    <AuthShell
      eyebrow="Email verification"
      title={state === "verified" ? "Email verified" : "Check your inbox"}
      description={
        state === "verified"
          ? "Your account is verified and ready to use."
          : "Verify your email before opening protected account pages."
      }
    >
      <div className="mt-8 space-y-4">
        {state === "applying" ? (
          <AuthMessage kind="info">Verifying your link…</AuthMessage>
        ) : null}
        {state === "sent" ? (
          <AuthMessage kind="success">
            A fresh verification email has been sent.
          </AuthMessage>
        ) : null}
        {message ? <AuthMessage>{message}</AuthMessage> : null}
        {state === "verified" ? (
          <Link
            className="inline-flex h-12 w-full items-center justify-center rounded-full bg-amber-300 font-semibold text-stone-950"
            href="/account"
          >
            Open my account
          </Link>
        ) : (
          <button
            className="h-12 w-full rounded-full bg-amber-300 font-semibold text-stone-950 disabled:cursor-wait disabled:opacity-60"
            disabled={state === "applying" || state === "sending"}
            onClick={resend}
            type="button"
          >
            {state === "sending" ? "Sending…" : "Resend verification email"}
          </button>
        )}
        <p className="text-center text-sm text-stone-400">
          Opened the link on another device?{" "}
          <Link className="text-amber-300 underline" href="/login">
            Sign in again
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
