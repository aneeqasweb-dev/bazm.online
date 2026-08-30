"use client";

import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { getFirebaseClientServices } from "@/lib/firebase/client";

function errorMessage(error: unknown) {
  return error instanceof FirebaseError
    ? error.message.replace(/^.*?:\s*/, "")
    : error instanceof Error
      ? error.message
      : "The admin action could not be completed.";
}

export function CallableActionButton({
  functionName,
  payload,
  confirm,
  children,
  className = "rounded-full border border-stone-700 px-3 py-1.5 text-xs text-stone-100 hover:border-amber-300",
  successMessage = "Saved.",
}: {
  functionName: string;
  payload: unknown;
  confirm?: string;
  children: ReactNode;
  className?: string;
  successMessage?: string;
}) {
  const { message, pending, run } = useCallableAction(functionName);

  async function handleRun() {
    if (confirm && !window.confirm(confirm)) return;
    await run(payload, successMessage);
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        className={className}
        disabled={pending}
        onClick={handleRun}
        type="button"
      >
        {pending ? "Working…" : children}
      </button>
      {message ? (
        <span className="max-w-52 text-right text-xs text-stone-400">
          {message}
        </span>
      ) : null}
    </span>
  );
}

export function useCallableAction(functionName: string) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();

  async function run(payload: unknown, successMessage = "Saved.") {
    setPending(true);
    setMessage(undefined);
    try {
      const { functions } = getFirebaseClientServices();
      await httpsCallable(functions, functionName)(payload);
      setMessage(successMessage);
      router.refresh();
      return true;
    } catch (error) {
      setMessage(errorMessage(error));
      return false;
    } finally {
      setPending(false);
    }
  }

  return { message, pending, run };
}
