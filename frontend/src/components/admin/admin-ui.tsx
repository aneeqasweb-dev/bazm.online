import Link from "next/link";
import type { ReactNode } from "react";

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-sm tracking-[0.28em] text-amber-300 uppercase">
          {eyebrow}
        </p>
        <h1 className="mt-3 text-4xl font-semibold">{title}</h1>
        <p className="mt-3 max-w-3xl leading-7 text-stone-400">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </section>
  );
}

export function AdminCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-3xl border border-stone-800 bg-stone-900 p-5 shadow-2xl shadow-black/10 sm:p-7 ${className}`}
    >
      {children}
    </section>
  );
}

export function AdminTableShell({
  children,
  minWidth = "760px",
}: {
  children: ReactNode;
  minWidth?: string;
}) {
  return (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

export function AdminEmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-700 p-8 text-center">
      <h3 className="font-semibold text-stone-100">{title}</h3>
      <p className="mt-2 text-sm text-stone-400">{description}</p>
    </div>
  );
}

export function AdminLoadingBlock({
  label = "Loading admin data",
}: {
  label?: string;
}) {
  return (
    <div className="rounded-3xl border border-stone-800 bg-stone-900 p-7">
      <div className="h-3 w-40 animate-pulse rounded-full bg-stone-800" />
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="h-24 animate-pulse rounded-2xl bg-stone-800" />
        <div className="h-24 animate-pulse rounded-2xl bg-stone-800" />
        <div className="h-24 animate-pulse rounded-2xl bg-stone-800" />
      </div>
      <p className="mt-5 text-sm text-stone-500">{label}…</p>
    </div>
  );
}

export function AdminStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase().replaceAll("_", " ");
  const tone =
    status.includes("FAILED") ||
    status.includes("REJECTED") ||
    status.includes("CANCELLED") ||
    status.includes("ARCHIVED")
      ? "border-red-900/70 bg-red-950/40 text-red-200"
      : status.includes("PENDING") ||
          status.includes("DRAFT") ||
          status.includes("REQUESTED")
        ? "border-amber-900/70 bg-amber-950/40 text-amber-200"
        : "border-emerald-900/70 bg-emerald-950/40 text-emerald-200";

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${tone}`}
    >
      {normalized}
    </span>
  );
}

export function AdminPagination({
  basePath,
  nextCursor,
  params = {},
}: {
  basePath: string;
  nextCursor: string | null;
  params?: Record<string, string | undefined>;
}) {
  if (!nextCursor) return null;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  query.set("after", nextCursor);
  return (
    <Link
      className="mt-5 inline-flex rounded-full border border-stone-700 px-4 py-2 text-sm text-stone-100 hover:border-amber-300 hover:text-amber-200"
      href={`${basePath}?${query}`}
    >
      Next page
    </Link>
  );
}

export function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-stone-800 bg-stone-950/60 p-5">
      <p className="text-xs tracking-[0.2em] text-stone-500 uppercase">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
      <p className="mt-2 text-sm text-stone-400">{helper}</p>
    </div>
  );
}

export function MiniBarChart({
  title,
  data,
  formatValue = (value) => String(value),
}: {
  title: string;
  data: { label: string; value: number }[];
  formatValue?: (value: number) => string;
}) {
  const max = Math.max(...data.map((item) => item.value), 1);
  return (
    <div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <div className="mt-5 space-y-3">
        {data.map((item) => (
          <div
            className="grid grid-cols-[5.5rem_minmax(0,1fr)_5rem] items-center gap-3 text-sm"
            key={item.label}
          >
            <span className="text-stone-400">{item.label}</span>
            <div className="h-2 overflow-hidden rounded-full bg-stone-800">
              <div
                className="h-full rounded-full bg-amber-300"
                style={{ width: `${Math.max(5, (item.value / max) * 100)}%` }}
              />
            </div>
            <span className="text-right text-stone-300">
              {formatValue(item.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
