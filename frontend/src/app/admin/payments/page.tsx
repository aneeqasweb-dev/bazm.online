import {
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  AdminPagination,
  AdminStatusBadge,
  AdminTableShell,
} from "@/components/admin/admin-ui";
import { listAdminPayments } from "@/lib/admin/admin-data";
import { requireAdminSession } from "@/lib/admin/server-auth";

import { RefundPaymentForm } from "./payment-actions";

const currency = new Intl.NumberFormat("en-PK", {
  currency: "PKR",
  style: "currency",
});

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string; q?: string; status?: string }>;
}) {
  await requireAdminSession("/admin/payments", ["payments.manage"]);
  const params = await searchParams;
  const payments = await listAdminPayments(params);

  return (
    <>
      <AdminPageHeader
        description="Inspect provider reconciliation, failure states, refunded totals, and initiate refunds through the trusted payment service."
        eyebrow="Payment operations"
        title="Payments"
      />
      <AdminCard>
        <form className="flex flex-wrap gap-3" method="get">
          <input
            aria-label="Search payment, order, or customer"
            className="field mt-0 max-w-xs"
            defaultValue={params.q ?? ""}
            name="q"
            placeholder="Search payment, order, customer"
          />
          <select
            aria-label="Filter payment status"
            className="field mt-0 max-w-xs"
            defaultValue={params.status ?? "ALL"}
            name="status"
          >
            <option value="ALL">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="REQUIRES_ACTION">Requires action</option>
            <option value="AUTHORIZED">Authorized</option>
            <option value="PAID">Paid</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="REFUNDED">Refunded</option>
            <option value="PARTIALLY_REFUNDED">Partially refunded</option>
          </select>
          <button
            className="rounded-full border border-stone-700 px-4 py-2 text-sm"
            type="submit"
          >
            Apply
          </button>
        </form>
        {payments.items.length ? (
          <>
            <AdminTableShell minWidth="1040px">
              <thead className="border-b border-stone-800 text-xs tracking-[0.16em] text-stone-500 uppercase">
                <tr>
                  <th className="pb-3">Payment</th>
                  <th className="pb-3">Order</th>
                  <th className="pb-3">Amount</th>
                  <th className="pb-3">Provider</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 text-right">Refund</th>
                </tr>
              </thead>
              <tbody>
                {payments.items.map((payment) => (
                  <tr
                    className="border-b border-stone-800/80 align-top"
                    key={payment.id}
                  >
                    <td className="py-4">
                      <p className="font-medium">{payment.id.slice(-10)}</p>
                      <p className="text-xs text-stone-500">{payment.userId}</p>
                    </td>
                    <td className="py-4 text-stone-300">{payment.orderId}</td>
                    <td className="py-4">
                      {currency.format(payment.amountMinor / 100)}
                      <p className="text-xs text-stone-500">
                        refunded {currency.format(payment.refundedMinor / 100)}
                      </p>
                    </td>
                    <td className="py-4 text-stone-300">
                      {payment.provider}
                      <p className="text-xs text-stone-500">
                        {payment.providerPaymentId ?? "No provider ID"}
                      </p>
                    </td>
                    <td className="py-4">
                      <AdminStatusBadge status={payment.status} />
                      {payment.failureCode ? (
                        <p className="mt-2 text-xs text-red-300">
                          {payment.failureCode}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-4 text-right">
                      <RefundPaymentForm payment={payment} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </AdminTableShell>
            <AdminPagination
              basePath="/admin/payments"
              nextCursor={payments.nextCursor}
              params={{ q: params.q, status: params.status }}
            />
          </>
        ) : (
          <AdminEmptyState
            description="Payment rows appear after checkout or payment webhook activity."
            title="No payments in this page"
          />
        )}
      </AdminCard>
    </>
  );
}
