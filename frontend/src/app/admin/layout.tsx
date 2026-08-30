import Link from "next/link";
import type { ReactNode } from "react";

import { FirebaseBrowserIntegrations } from "@/components/providers/firebase-browser-integrations";
import { LogoutButton } from "@/components/auth/logout-button";
import { ADMIN_MODULES, canUseAdminModule } from "@/lib/admin/permissions";
import { requireAdminSession } from "@/lib/admin/server-auth";
import { privateMetadata } from "@/lib/seo/config";

export const metadata = privateMetadata(
  "Bazm administration",
  "Bazm administration pages are private operational pages and are not intended for search indexing.",
);

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const claims = await requireAdminSession("/admin");
  const modules = ADMIN_MODULES.filter((module) =>
    canUseAdminModule(
      (claims ?? {}) as Record<string, unknown>,
      module.permission,
    ),
  );

  return (
    <main className="min-h-screen bg-stone-950 px-4 py-6 text-stone-50 sm:px-6 lg:px-8">
      <FirebaseBrowserIntegrations />
      <div className="mx-auto grid max-w-[90rem] gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-stone-800 bg-stone-900/80 p-5 lg:sticky lg:top-6 lg:h-[calc(100vh-3rem)]">
          <div className="flex items-center justify-between gap-4 lg:block">
            <Link className="text-lg font-semibold" href="/">
              Bazm
            </Link>
            <div className="lg:mt-5">
              <LogoutButton />
            </div>
          </div>
          <nav
            aria-label="Admin navigation"
            className="mt-6 grid gap-1 sm:grid-cols-2 lg:grid-cols-1"
          >
            {modules.map((module) => (
              <Link
                className="rounded-2xl px-3 py-2.5 text-sm text-stone-300 hover:bg-stone-800 hover:text-white"
                href={module.href}
                key={module.href}
              >
                {module.label}
              </Link>
            ))}
          </nav>
          <p className="mt-6 text-xs leading-5 text-stone-500">
            Signed in as {String(claims?.role ?? "admin").toLowerCase()} · all
            changes use trusted Functions and audit logs.
          </p>
        </aside>
        <div className="min-w-0 space-y-8 py-3">{children}</div>
      </div>
    </main>
  );
}
