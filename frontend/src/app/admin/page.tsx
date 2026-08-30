import Link from "next/link";

import {
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  MetricCard,
  MiniBarChart,
} from "@/components/admin/admin-ui";
import { getAdminDashboardMetrics } from "@/lib/admin/admin-data";
import { ADMIN_MODULES, canUseAdminModule } from "@/lib/admin/permissions";
import { requireAdminSession } from "@/lib/admin/server-auth";

const currency = new Intl.NumberFormat("en-PK", {
  currency: "PKR",
  maximumFractionDigits: 0,
  style: "currency",
});

export default async function AdminPage() {
  const claims = await requireAdminSession("/admin");
  const claimRecord = (claims ?? {}) as Record<string, unknown>;
  const modules = ADMIN_MODULES.filter((module) =>
    canUseAdminModule(claimRecord, module.permission),
  );
  const canViewReports = canUseAdminModule(claimRecord, "reports.view");
  const metrics = canViewReports ? await getAdminDashboardMetrics() : null;

  return (
    <>
      <AdminPageHeader
        description="A permission-aware operations workspace for catalog, fulfilment, customers, payments, returns, settings, reports, and audit review."
        eyebrow="Protected workspace"
        title="Administration"
      />

      {metrics ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {metrics.cards.map((card) => (
              <MetricCard
                helper={card.helper}
                key={card.label}
                label={card.label}
                value={
                  "valueMinor" in card && typeof card.valueMinor === "number"
                    ? currency.format(card.valueMinor / 100)
                    : card.value.toLocaleString("en-PK")
                }
              />
            ))}
          </section>
          <div className="grid gap-6 xl:grid-cols-2">
            <AdminCard>
              <MiniBarChart
                data={metrics.revenueSeries.map((item) => ({
                  label: item.label,
                  value: Math.round(item.value / 100),
                }))}
                formatValue={(value) => currency.format(value)}
                title="7-day net revenue"
              />
            </AdminCard>
            <AdminCard>
              <MiniBarChart
                data={metrics.orderSeries}
                title="7-day order volume"
              />
            </AdminCard>
          </div>
        </>
      ) : (
        <AdminEmptyState
          description="Your account can use operational modules, but dashboard metrics require the reports.view permission."
          title="Metrics hidden"
        />
      )}

      <AdminCard>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">Admin modules</h2>
            <p className="mt-2 text-sm text-stone-400">
              Only modules allowed by your role and permissions are shown here.
            </p>
          </div>
          <p className="text-xs text-stone-500">
            Generated in Asia/Karachi · PKR metrics
          </p>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {modules.map((module) => (
            <Link
              className="rounded-2xl border border-stone-800 bg-stone-950/50 p-4 hover:border-amber-300"
              href={module.href}
              key={module.href}
            >
              <h3 className="font-semibold">{module.label}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-400">
                {module.description}
              </p>
            </Link>
          ))}
        </div>
      </AdminCard>
    </>
  );
}
