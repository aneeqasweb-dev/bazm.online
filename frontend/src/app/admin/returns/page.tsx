import {
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  AdminPagination,
  AdminStatusBadge,
  AdminTableShell,
} from "@/components/admin/admin-ui";
import { formatPkr } from "@/components/store/product-card";
import { listAdminReturns } from "@/lib/admin/admin-data";
import { requireAdminSession } from "@/lib/admin/server-auth";

import { ReturnStatusForm } from "./return-actions";

export default async function AdminReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string; q?: string; status?: string }>;
}) {
  await requireAdminSession("/admin/returns", ["returns.manage"]);
  const params = await searchParams;
  const returns = await listAdminReturns(params);

  return (
    <>
      <AdminPageHeader
        description="Review requested returns, track evidence counts, advance receipt/refund states, and leave staff notes for support continuity."
        eyebrow="After-sales"
        title="Returns"
      />
      <AdminCard>
        <form className="flex flex-wrap gap-3" method="get">
          <input
            className="field mt-0 max-w-xs"
            defaultValue={params.q ?? ""}
            name="q"
            placeholder="Search return, order, user"
          />
          <select
            className="field mt-0 max-w-xs"
            defaultValue={params.status ?? "ALL"}
            name="status"
          >
            <option value="ALL">All statuses</option>
            <option value="REQUESTED">Requested</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="RECEIVED">Received</option>
            <option value="REFUNDED">Refunded</option>
            <option value="CLOSED">Closed</option>
          </select>
          <button
            className="rounded-full border border-stone-700 px-4 py-2 text-sm"
            type="submit"
          >
            Apply
          </button>
        </form>
        {returns.items.length ? (
          <>
            <AdminTableShell minWidth="980px">
              <thead className="border-b border-stone-800 text-xs tracking-[0.16em] text-stone-500 uppercase">
                <tr>
                  <th className="pb-3">Return</th>
                  <th className="pb-3">Items</th>
                  <th className="pb-3">Notes</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {returns.items.map((returnRequest) => (
                  <tr
                    className="border-b border-stone-800/80 align-top"
                    key={returnRequest.id}
                  >
                    <td className="py-4">
                      <p className="font-medium">{returnRequest.id}</p>
                      <p className="text-xs text-stone-500">
                        order {returnRequest.orderId}
                      </p>
                      <p className="text-xs text-stone-500">
                        {new Date(returnRequest.requestedAt).toLocaleString(
                          "en-PK",
                        )}
                      </p>
                    </td>
                    <td className="py-4 text-xs text-stone-400">
                      {returnRequest.items.map((item) => (
                        <p key={`${returnRequest.id}-${item.sku}`}>
                          {item.quantity} × {item.sku} · {item.reason}
                        </p>
                      ))}
                      <p className="mt-2">
                        Evidence: {returnRequest.evidenceCount}
                      </p>
                      <p className="mt-2">
                        Policy: {returnRequest.policyVersion}
                      </p>
                      <p>
                        Eligible refund:{" "}
                        {returnRequest.refundAmount
                          ? formatPkr(returnRequest.refundAmount.amountMinor)
                          : "not set"}
                      </p>
                    </td>
                    <td className="max-w-xs py-4 text-sm text-stone-400">
                      {returnRequest.customerNote ?? "No customer note"}
                      {returnRequest.staffNote ? (
                        <p className="mt-2 text-stone-500">
                          Staff: {returnRequest.staffNote}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-4">
                      <AdminStatusBadge status={returnRequest.status} />
                      <p className="mt-2 text-xs text-stone-500">
                        Condition:{" "}
                        {returnRequest.condition
                          .toLowerCase()
                          .replaceAll("_", " ")}
                      </p>
                      {returnRequest.refundId ? (
                        <p className="mt-1 text-xs text-stone-500">
                          Refund {returnRequest.refundId}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-4 text-right">
                      <ReturnStatusForm
                        condition={returnRequest.condition}
                        currentStatus={returnRequest.status}
                        refundAmount={returnRequest.refundAmount}
                        refundPaymentId={returnRequest.refundPaymentId}
                        returnId={returnRequest.id}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </AdminTableShell>
            <AdminPagination
              basePath="/admin/returns"
              nextCursor={returns.nextCursor}
              params={{ q: params.q, status: params.status }}
            />
          </>
        ) : (
          <AdminEmptyState
            description="Return requests appear after customers submit them."
            title="No returns in this page"
          />
        )}
      </AdminCard>
    </>
  );
}
