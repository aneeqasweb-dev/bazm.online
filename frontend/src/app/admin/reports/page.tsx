import {
  AdminCard,
  AdminPageHeader,
  MetricCard,
  MiniBarChart,
} from "@/components/admin/admin-ui";
import { getAdminDashboardMetrics } from "@/lib/admin/admin-data";
import { requireAdminSession } from "@/lib/admin/server-auth";

const currency = new Intl.NumberFormat("en-PK", {
  currency: "PKR",
  maximumFractionDigits: 0,
  style: "currency",
});

export default async function AdminReportsPage() {
  await requireAdminSession("/admin/reports", ["reports.view"]);
  const metrics = await getAdminDashboardMetrics();
  const orderStatus = Object.entries(metrics.orderStatus).map(
    ([label, value]) => ({
      label: label.toLowerCase().replaceAll("_", " "),
      value,
    }),
  );
  const returnStatus = Object.entries(metrics.returnStatus).map(
    ([label, value]) => ({
      label: label.toLowerCase(),
      value,
    }),
  );

  return (
    <>
      <AdminPageHeader
        description={`Metrics are generated from bounded recent Firestore reads in ${metrics.timeZone}; all money is ${metrics.currency} and net revenue subtracts recorded refunds.`}
        eyebrow="Operations intelligence"
        title="Reports"
      />
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
          <MiniBarChart data={metrics.orderSeries} title="7-day order volume" />
        </AdminCard>
        <AdminCard>
          <MiniBarChart data={orderStatus} title="Orders by status" />
        </AdminCard>
        <AdminCard>
          <MiniBarChart data={returnStatus} title="Returns by status" />
        </AdminCard>
      </div>
      <AdminCard>
        <h2 className="text-2xl font-semibold">Stock alerts</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {metrics.stockAlerts.map((item) => (
            <div
              className="rounded-2xl border border-stone-800 p-4"
              key={item.sku}
            >
              <p className="font-medium">{item.sku}</p>
              <p className="mt-2 text-sm text-stone-400">
                {item.available} available · reorder at {item.reorderPoint}
              </p>
            </div>
          ))}
          {metrics.stockAlerts.length === 0 ? (
            <p className="text-sm text-stone-400">No low-stock alerts.</p>
          ) : null}
        </div>
      </AdminCard>
    </>
  );
}
