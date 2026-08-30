import {
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  AdminPagination,
  AdminStatusBadge,
  AdminTableShell,
} from "@/components/admin/admin-ui";
import { listAdminOrders } from "@/lib/admin/admin-data";
import { requireAdminSession } from "@/lib/admin/server-auth";

import { OrderTransitionForm } from "./order-actions";

const currency = new Intl.NumberFormat("en-PK", {
  currency: "PKR",
  style: "currency",
});

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string; q?: string; status?: string }>;
}) {
  await requireAdminSession("/admin/orders", ["orders.manage"]);
  const params = await searchParams;
  const orders = await listAdminOrders(params);

  return (
    <>
      <AdminPageHeader
        description="Search, filter, paginate, and transition orders through the same trusted fulfilment Function used by the rest of the commerce flow."
        eyebrow="Fulfilment"
        title="Orders"
      />
      <AdminCard>
        <form className="flex flex-wrap gap-3" method="get">
          <input
            className="field mt-0 max-w-xs"
            defaultValue={params.q ?? ""}
            name="q"
            placeholder="Search order, customer, tracking"
          />
          <select
            className="field mt-0 max-w-xs"
            defaultValue={params.status ?? "ALL"}
            name="status"
          >
            <option value="ALL">All statuses</option>
            <option value="PENDING_PAYMENT">Pending payment</option>
            <option value="PAID">Paid</option>
            <option value="PROCESSING">Processing</option>
            <option value="SHIPPED">Shipped</option>
            <option value="DELIVERED">Delivered</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="RETURN_REQUESTED">Return requested</option>
            <option value="RETURNED">Returned</option>
            <option value="REFUNDED">Refunded</option>
          </select>
          <button
            className="rounded-full border border-stone-700 px-4 py-2 text-sm"
            type="submit"
          >
            Apply
          </button>
        </form>
        {orders.items.length ? (
          <>
            <AdminTableShell minWidth="980px">
              <thead className="border-b border-stone-800 text-xs tracking-[0.16em] text-stone-500 uppercase">
                <tr>
                  <th className="pb-3">Order</th>
                  <th className="pb-3">Customer</th>
                  <th className="pb-3">Total</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Fulfilment</th>
                  <th className="pb-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.items.map((order) => (
                  <tr
                    className="border-b border-stone-800/80 align-top"
                    key={order.id}
                  >
                    <td className="py-4">
                      <p className="font-medium">
                        {order.id.slice(-8).toUpperCase()}
                      </p>
                      <p className="text-xs text-stone-500">
                        {new Date(order.placedAt).toLocaleString("en-PK")}
                      </p>
                    </td>
                    <td className="py-4 text-stone-300">{order.userId}</td>
                    <td className="py-4">
                      {currency.format(order.totalMinor / 100)}
                    </td>
                    <td className="py-4">
                      <AdminStatusBadge status={order.status} />
                    </td>
                    <td className="py-4 text-stone-300">
                      {order.itemCount} items ·{" "}
                      {order.deliveryMethod.toLowerCase()} ·{" "}
                      {order.paymentMethod.toLowerCase()}
                    </td>
                    <td className="py-4 text-right">
                      <OrderTransitionForm
                        currentStatus={order.status}
                        orderId={order.id}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </AdminTableShell>
            <AdminPagination
              basePath="/admin/orders"
              nextCursor={orders.nextCursor}
              params={{ q: params.q, status: params.status }}
            />
          </>
        ) : (
          <AdminEmptyState
            description="Try clearing filters or wait for checkout activity."
            title="No orders in this page"
          />
        )}
      </AdminCard>
    </>
  );
}
