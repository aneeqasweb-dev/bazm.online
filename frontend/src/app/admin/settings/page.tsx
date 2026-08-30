import {
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  AdminPagination,
  AdminStatusBadge,
} from "@/components/admin/admin-ui";
import { listAdminSettings } from "@/lib/admin/admin-data";
import { requireAdminSession } from "@/lib/admin/server-auth";

import { SettingsForm } from "./settings-actions";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string; q?: string }>;
}) {
  await requireAdminSession("/admin/settings", ["settings.manage"]);
  const params = await searchParams;
  const settings = await listAdminSettings(params);

  return (
    <>
      <AdminPageHeader
        description="Maintain versioned JSON settings for payment, email sender, shipping, tax, return policy, and feature flags."
        eyebrow="Configuration"
        title="Settings"
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_28rem]">
        <AdminCard>
          <form className="mb-5 flex flex-wrap gap-3" method="get">
            <input
              className="field mt-0 max-w-xs"
              defaultValue={params.q ?? ""}
              name="q"
              placeholder="Search settings"
            />
            <button
              className="rounded-full border border-stone-700 px-4 py-2 text-sm"
              type="submit"
            >
              Apply
            </button>
          </form>
          {settings.items.length ? (
            <div className="space-y-4">
              {settings.items.map((item) => (
                <article
                  className="rounded-2xl border border-stone-800 p-4"
                  key={item.key}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-semibold">{item.key}</h2>
                      <p className="mt-1 text-xs text-stone-500">
                        Revision {item.revision} · updated{" "}
                        {new Date(item.updatedAt).toLocaleString("en-PK")}
                      </p>
                    </div>
                    <AdminStatusBadge status={item.visibility} />
                  </div>
                  <div className="mt-4">
                    <SettingsForm
                      initialKey={item.key}
                      initialValue={item.valueJson}
                      initialVisibility={item.visibility}
                      revision={item.revision}
                    />
                  </div>
                </article>
              ))}
              <AdminPagination
                basePath="/admin/settings"
                nextCursor={settings.nextCursor}
                params={{ q: params.q }}
              />
            </div>
          ) : (
            <AdminEmptyState
              description="Create a JSON settings document from the form on the right."
              title="No settings in this page"
            />
          )}
        </AdminCard>
        <SettingsForm />
      </div>
    </>
  );
}
