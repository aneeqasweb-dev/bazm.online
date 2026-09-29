"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AuthMessage, AuthShell } from "@/components/auth/auth-shell";
import {
  applyEmailVerificationCode,
  checkEmailVerification,
  sendVerificationEmail,
} from "@/lib/auth/auth-client";
import { getAuthErrorMessage } from "@/lib/auth/auth-errors";
import { authHref } from "@/lib/auth/navigation";
import { useAuthReady } from "@/lib/auth/use-auth-ready";

type VerificationState =
  | "checking"
  | "ready"
  | "verified"
  | "signed-out"
  | "sending"
  | "sent"
  | "error";

export function VerifyEmailClient({
  code,
  nextPath = "/account",
}: {
  code?: string;
  nextPath?: string;
}) {
  const router = useRouter();
  const ready = useAuthReady();
  const [state, setState] = useState<VerificationState>("checking");
  const [message, setMessage] = useState<string>();
  const busy = useRef(false);
  // Applying a one-use email code must not run twice in Strict Mode.
  const initialCheck = useRef<{
    code?: string;
    promise: Promise<string>;
  } | null>(null);
  const signInPath = authHref("/login", nextPath);
  const emailConfirmed =
    state === "verified" || (Boolean(code) && state === "signed-out");

  useEffect(() => {
    let current = true;
    if (!initialCheck.current || initialCheck.current.code !== code) {
      initialCheck.current = {
        code,
        promise: code
          ? applyEmailVerificationCode(code).then((result) =>
              result?.emailVerified ? "verified" : "signed-out",
            )
          : checkEmailVerification(),
      };
    }
    initialCheck.current.promise
      .then((result) => {
        if (current)
          setState(
            result === "verified"
              ? "verified"
              : result === "signed-out"
                ? "signed-out"
                : "ready",
          );
      })
      .catch((error) => {
        if (!current) return;
        setMessage(
          getAuthErrorMessage(
            error,
            "We couldn’t check your email yet. Try again or sign in to continue.",
          ),
        );
        setState("error");
      });
    return () => {
      current = false;
    };
  }, [code]);

  async function continueAfterVerification() {
    if (!ready || busy.current) return;
    busy.current = true;
    setState("checking");
    setMessage(undefined);
    try {
      const result = await checkEmailVerification();
      if (result === "verified") {
        router.replace(nextPath);
        router.refresh();
        return;
      }
      if (result === "signed-out") {
        router.replace(signInPath);
        return;
      }
      setState("ready");
      setMessage(
        "Your email isn’t verified yet. Open the link in your email, then try again here.",
      );
    } catch (error) {
      setMessage(
        getAuthErrorMessage(
          error,
          "Please sign in again to finish verification and continue.",
        ),
      );
      setState("error");
    } finally {
      busy.current = false;
    }
  }

  async function resend() {
    if (!ready || busy.current) return;
    busy.current = true;
    setState("sending");
    setMessage(undefined);
    try {
      await sendVerificationEmail(nextPath);
      setState("sent");
    } catch (error) {
      setMessage(
        getAuthErrorMessage(
          error,
          "Sign in again, then request a new verification email.",
        ),
      );
      setState("error");
    } finally {
      busy.current = false;
    }
  }

  return (
    <AuthShell
      eyebrow="One last step"
      title={emailConfirmed ? "Email verified" : "Check your inbox"}
      description={
        emailConfirmed
          ? "Your account is ready. Continue where you left off."
          : "Open the verification email from Bazm, tap the link, then return here to continue."
      }
    >
      <div className="mt-8 space-y-4">
        {state === "checking" ? (
          <AuthMessage kind="info">Checking your verification…</AuthMessage>
        ) : null}
        {state === "sent" ? (
          <AuthMessage kind="success">
            A fresh verification email has been sent. Check your inbox or spam
            folder.
          </AuthMessage>
        ) : null}
        {message ? <AuthMessage>{message}</AuthMessage> : null}
        {state === "verified" ? (
          <Link
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-amber-300 px-4 py-3 font-semibold text-stone-950"
            href={nextPath}
          >
            {nextPath === "/checkout"
              ? "Continue to checkout"
              : nextPath === "/account"
                ? "Open my account"
                : "Continue"}
          </Link>
        ) : state === "signed-out" ? (
          <>
            <AuthMessage kind="info">
              Sign in to check your email status and continue with your account.
            </AuthMessage>
            <Link
              className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-amber-300 px-4 py-3 font-semibold text-stone-950"
              href={signInPath}
            >
              Sign in to continue
            </Link>
          </>
        ) : (
          <>
            <button
              className="min-h-12 w-full rounded-full bg-amber-300 px-4 py-3 font-semibold text-stone-950 disabled:cursor-wait disabled:opacity-60"
              disabled={!ready || state === "checking" || state === "sending"}
              onClick={continueAfterVerification}
              type="button"
            >
              {state === "checking" ? "Checking…" : "I’ve verified my email"}
            </button>
            <button
              className="min-h-12 w-full rounded-full border border-stone-700 px-4 py-3 font-medium disabled:cursor-wait disabled:opacity-60"
              disabled={!ready || state === "checking" || state === "sending"}
              onClick={resend}
              type="button"
            >
              {state === "sending" ? "Sending…" : "Resend verification email"}
            </button>
            <p className="text-sm leading-6 text-stone-400">
              Can’t find it? Check your spam or junk folder. Your shopping bag
              stays saved while you verify.
            </p>
          </>
        )}
        <p className="text-center text-sm text-stone-400">
          Using another browser?{" "}
          <Link className="text-amber-300 underline" href={signInPath}>
            Sign in again
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
