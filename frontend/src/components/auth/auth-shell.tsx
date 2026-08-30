import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-stone-950 px-6 py-12 text-stone-50">
      <section className="w-full max-w-lg">
        <Link className="text-sm text-stone-400 hover:text-stone-100" href="/">
          ← Back to Bazm
        </Link>
        <p className="mt-8 text-sm tracking-[0.28em] text-amber-300 uppercase">
          {eyebrow}
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 leading-7 text-stone-400">{description}</p>
        {children}
      </section>
    </main>
  );
}

export function AuthMessage({
  children,
  kind = "error",
}: {
  children: ReactNode;
  kind?: "error" | "info" | "success";
}) {
  const styles = {
    error: "bg-red-950 text-red-200",
    info: "bg-stone-900 text-stone-300",
    success: "bg-emerald-950 text-emerald-200",
  }[kind];

  return (
    <p
      className={`rounded-xl p-3 text-sm ${styles}`}
      role={kind === "error" ? "alert" : "status"}
    >
      {children}
    </p>
  );
}

export function AuthField({
  label,
  name,
  type = "text",
  autoComplete,
  error,
  hint,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete: string;
  error?: string;
  hint?: string;
  defaultValue?: string;
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
        defaultValue={defaultValue}
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
