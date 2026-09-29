"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { logout } from "@/lib/auth/auth-client";
import { useAuthReady } from "@/lib/auth/use-auth-ready";

export function LogoutButton() {
  const router = useRouter();
  const ready = useAuthReady();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function handleLogout() {
    if (!ready || pending) return;
    setPending(true);
    setError(undefined);
    try {
      await logout();
      router.replace("/login");
      router.refresh();
    } catch {
      setError("We couldn’t sign you out. Please try again.");
      setPending(false);
    }
  }

  return (
    <div className="text-right">
      <button
        className="rounded-full border border-stone-700 px-5 py-2 text-sm font-medium disabled:cursor-wait disabled:opacity-60"
        disabled={!ready || pending}
        onClick={handleLogout}
        type="button"
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {error ? (
        <p role="alert" className="mt-2 max-w-xs text-xs text-rose-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
