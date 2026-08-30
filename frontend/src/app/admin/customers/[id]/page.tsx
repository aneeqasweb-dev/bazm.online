import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AdminCard,
  AdminPageHeader,
  AdminStatusBadge,
  AdminTableShell,
} from "@/components/admin/admin-ui";
import { getCustomer360 } from "@/lib/admin/admin-data";
import { requireAdminSession } from "@/lib/admin/server-auth";

const money = (minor: number) =>
  new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR" }).format(
    minor / 100,
  );
export default async function Customer360Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminSession("/admin/customers", ["customers.manage"]);
  const { id } = await params;
  const customer = await getCustomer360(id);
  if (!customer) notFound();
  return (
    <>
      <AdminPageHeader
        eyebrow="Customer 360"
        title={customer.profile.name}
        description="A privacy-minimized operational view built from authoritative commerce records."
      />
      <div className="grid gap-4 md:grid-cols-4">
        <AdminCard>
          <p className="text-xs text-stone-500 uppercase">Segment</p>
          <AdminStatusBadge status={customer.segment} />
        </AdminCard>
        <AdminCard>
          <p className="text-xs text-stone-500 uppercase">Lifetime spend</p>
          <p
            className="text-2xl"
            data-spend-minor={customer.metrics.spendMinor}
          >
            {money(customer.metrics.spendMinor)}
          </p>
        </AdminCard>
        <AdminCard>
          <p className="text-xs text-stone-500 uppercase">Completed orders</p>
          <p className="text-2xl">{customer.metrics.orderCount}</p>
        </AdminCard>
        <AdminCard>
          <p className="text-xs text-stone-500 uppercase">Engagement</p>
          <p>
            {customer.metrics.wishlistCount} wishlist ·{" "}
            {customer.metrics.reviewCount} reviews
          </p>
        </AdminCard>
      </div>
      <AdminCard>
        <h2 className="text-lg">Profile</h2>
        <p>
          {customer.profile.email} · {customer.profile.phone ?? "No phone"}
        </p>
        <p className="text-sm text-stone-400">
          {customer.profile.role} ·{" "}
          {customer.profile.isActive ? "active" : "disabled"} · joined{" "}
          {new Date(customer.profile.createdAt).toLocaleDateString("en-PK")}
        </p>
      </AdminCard>
      <AdminCard>
        <h2 className="mb-3 text-lg">Recent orders</h2>
        <AdminTableShell minWidth="600px">
          <tbody>
            {customer.orders.map((order) => (
              <tr className="border-b border-stone-800" key={order.id}>
                <td className="py-3">
                  <Link
                    className="underline"
                    href={`/admin/orders?q=${order.id}`}
                  >
                    {order.id}
                  </Link>
                </td>
                <td>{order.status}</td>
                <td>{money(order.totalMinor)}</td>
                <td>{new Date(order.placedAt).toLocaleDateString("en-PK")}</td>
              </tr>
            ))}
          </tbody>
        </AdminTableShell>
      </AdminCard>
      <AdminCard>
        <h2 className="mb-3 text-lg">Recent activity</h2>
        {customer.activities.length ? (
          <ul>
            {customer.activities.map((event) => (
              <li className="border-b border-stone-800 py-2" key={event.id}>
                {event.type.replaceAll("_", " ")}{" "}
                <span className="text-xs text-stone-500">
                  {new Date(event.createdAt).toLocaleString("en-PK")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-stone-400">No consented activity retained.</p>
        )}
      </AdminCard>
      <AdminCard>
        <h2 className="mb-3 text-lg">Support</h2>
        {customer.tickets.map((ticket) => (
          <p key={ticket.id}>
            <Link className="underline" href={`/admin/support?q=${ticket.id}`}>
              {ticket.subject}
            </Link>{" "}
            · {ticket.status}
          </p>
        ))}
      </AdminCard>
    </>
  );
}
