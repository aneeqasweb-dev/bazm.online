"use client";

import { useState } from "react";

import { useCallableAction } from "@/components/admin/callable-action";

export function SettingsForm({
  initialKey = "",
  initialVisibility = "PRIVATE",
  initialValue = "{\n  \n}",
  revision,
}: {
  initialKey?: string;
  initialVisibility?: "PUBLIC" | "PRIVATE";
  initialValue?: string;
  revision?: number;
}) {
  const { message, pending, run } = useCallableAction("upsertSettings");
  const [jsonError, setJsonError] = useState<string>();

  return (
    <form
      className="grid gap-3 rounded-2xl border border-stone-800 p-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setJsonError(undefined);
        if (!window.confirm("Save this settings revision?")) return;
        const form = new FormData(event.currentTarget);
        try {
          const parsed = JSON.parse(
            String(form.get("value") ?? "{}"),
          ) as unknown;
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("Settings value must be a JSON object.");
          }
          await run(
            {
              key: form.get("key"),
              visibility: form.get("visibility"),
              value: parsed,
              expectedRevision: revision ?? null,
            },
            "Settings saved.",
          );
        } catch (error) {
          setJsonError(
            error instanceof Error ? error.message : "Enter valid JSON.",
          );
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <input
          className="field"
          defaultValue={initialKey}
          name="key"
          placeholder="commerce.tax"
          readOnly={Boolean(initialKey)}
          required
        />
        <select
          className="field"
          defaultValue={initialVisibility}
          name="visibility"
        >
          <option value="PRIVATE">Private</option>
          <option value="PUBLIC">Public</option>
        </select>
      </div>
      <textarea
        className="field min-h-48 font-mono text-xs"
        defaultValue={initialValue}
        name="value"
        required
      />
      <button
        className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-stone-950 disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending
          ? "Saving…"
          : revision
            ? `Save rev ${revision + 1}`
            : "Create settings"}
      </button>
      {jsonError ? <p className="text-sm text-red-300">{jsonError}</p> : null}
      {message ? <p className="text-sm text-stone-400">{message}</p> : null}
    </form>
  );
}
