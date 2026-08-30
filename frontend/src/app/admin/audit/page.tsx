import {
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  AdminPagination,
  AdminStatusBadge,
  AdminTableShell,
} from "@/components/admin/admin-ui";
import { listAdminAuditLogs } from "@/lib/admin/admin-data";
import { requireAdminSession } from "@/lib/admin/server-auth";

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string; q?: string; action?: string }>;
}) {
  await requireAdminSession("/admin/audit", ["audit.view"]);
  const params = await searchParams;
  const audit = await listAdminAuditLogs(params);

  return (
    <>
      <AdminPageHeader
        description="Review immutable administrative actions, actors, targets, metadata, and correlation IDs."
        eyebrow="Governance"
        title="Audit logs"
      />
      <AdminCard>
        <form className="flex flex-wrap gap-3" method="get">
          <input
            className="field mt-0 max-w-xs"
            defaultValue={params.q ?? ""}
            name="q"
            placeholder="Search audit logs"
          />
          <select
            className="field mt-0 max-w-xs"
            defaultValue={params.action ?? "ALL"}
            name="action"
          >
            <option value="ALL">All actions</option>
            <option value="AUTH">Auth</option>
            <option value="CATALOG">Catalog</option>
            <option value="INVENTORY">Inventory</option>
            <option value="ORDER">Order</option>
            <option value="PAYMENT">Payment</option>
            <option value="COUPON">Coupon</option>
            <option value="RETURN">Return</option>
            <option value="SETTINGS">Settings</option>
          </select>
          <button
            className="rounded-full border border-stone-700 px-4 py-2 text-sm"
            type="submit"
          >
            Apply
          </button>
        </form>
        {audit.items.length ? (
          <>
            <AdminTableShell minWidth="980px">
              <thead className="border-b border-stone-800 text-xs tracking-[0.16em] text-stone-500 uppercase">
                <tr>
                  <th className="pb-3">Action</th>
                  <th className="pb-3">Actor</th>
                  <th className="pb-3">Target</th>
                  <th className="pb-3">Metadata</th>
                  <th className="pb-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {audit.items.map((entry) => (
                  <tr
                    className="border-b border-stone-800/80 align-top"
                    key={entry.id}
                  >
                    <td className="py-4">
                      <AdminStatusBadge status={entry.action} />
                      <p className="mt-2 text-xs text-stone-600">{entry.id}</p>
                    </td>
                    <td className="py-4 text-xs text-stone-400">
                      {entry.actorId ?? "system"}
                    </td>
                    <td className="py-4 text-xs text-stone-400">
                      {entry.targetType}
                      <br />
                      {entry.targetId ?? "none"}
                    </td>
                    <td className="max-w-md py-4">
                      <pre className="rounded-xl bg-stone-950 p-3 text-xs whitespace-pre-wrap text-stone-300">
                        {JSON.stringify(entry.metadata, null, 2)}
                      </pre>
                      <p className="mt-2 text-xs text-stone-600">
                        {entry.correlationId}
                      </p>
                    </td>
                    <td className="py-4 text-xs text-stone-400">
                      {new Date(entry.createdAt).toLocaleString("en-PK")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </AdminTableShell>
            <AdminPagination
              basePath="/admin/audit"
              nextCursor={audit.nextCursor}
              params={{ action: params.action, q: params.q }}
            />
          </>
        ) : (
          <AdminEmptyState
            description="Audit records appear after trusted administrative actions."
            title="No audit logs in this page"
          />
        )}
      </AdminCard>
    </>
  );
}
