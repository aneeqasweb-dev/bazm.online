"use client";

import { AdminCard } from "@/components/admin/admin-ui";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AdminCard>
      <p className="text-sm tracking-[0.22em] text-red-300 uppercase">
        Admin error
      </p>
      <h1 className="mt-3 text-2xl font-semibold">Something went sideways.</h1>
      <p className="mt-3 text-sm text-stone-400">
        {error.message || "The admin module could not be rendered."}
      </p>
      <button
        className="mt-5 rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-stone-950"
        onClick={reset}
        type="button"
      >
        Try again
      </button>
    </AdminCard>
  );
}
