"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { logout } from "@/lib/auth/auth-client";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    await logout();
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      className="rounded-full border border-stone-700 px-5 py-2 text-sm font-medium disabled:cursor-wait disabled:opacity-60"
      disabled={pending}
      onClick={handleLogout}
      type="button"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
