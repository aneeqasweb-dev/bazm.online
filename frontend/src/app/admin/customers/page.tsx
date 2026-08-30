import {
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  AdminPagination,
  AdminStatusBadge,
  AdminTableShell,
} from "@/components/admin/admin-ui";
import { listAdminCustomers } from "@/lib/admin/admin-data";
import { requireAdminSession } from "@/lib/admin/server-auth";

import { CustomerAccessForm } from "./customer-actions";
import Link from "next/link";

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    after?: string;
    q?: string;
    role?: string;
    state?: string;
  }>;
}) {
  await requireAdminSession("/admin/customers", ["customers.manage"]);
  const params = await searchParams;
  const customers = await listAdminCustomers(params);

  return (
    <>
      <AdminPageHeader
        description="Review customers and staff, adjust access state, and grant permissions through audited server-side claims updates."
        eyebrow="Identity operations"
        title="Customers and staff"
      />
      <AdminCard>
        <form className="flex flex-wrap gap-3" method="get">
          <input
            className="field mt-0 max-w-xs"
            defaultValue={params.q ?? ""}
            name="q"
            placeholder="Search name, email, user ID"
          />
          <select
            className="field mt-0 max-w-xs"
            defaultValue={params.role ?? "ALL"}
            name="role"
          >
            <option value="ALL">All roles</option>
            <option value="CUSTOMER">Customer</option>
            <option value="STAFF">Staff</option>
            <option value="ADMIN">Admin</option>
            <option value="SUPER_ADMIN">Super admin</option>
          </select>
          <select
            className="field mt-0 max-w-xs"
            defaultValue={params.state ?? "ALL"}
            name="state"
          >
            <option value="ALL">All states</option>
            <option value="ACTIVE">Active</option>
            <option value="DISABLED">Disabled</option>
            <option value="UNVERIFIED">Unverified</option>
          </select>
          <button
            className="rounded-full border border-stone-700 px-4 py-2 text-sm"
            type="submit"
          >
            Apply
          </button>
        </form>
        {customers.items.length ? (
          <>
            <AdminTableShell minWidth="1040px">
              <thead className="border-b border-stone-800 text-xs tracking-[0.16em] text-stone-500 uppercase">
                <tr>
                  <th className="pb-3">Profile</th>
                  <th className="pb-3">Role</th>
                  <th className="pb-3">State</th>
                  <th className="pb-3">Permissions</th>
                  <th className="pb-3 text-right">Access</th>
                </tr>
              </thead>
              <tbody>
                {customers.items.map((customer) => (
                  <tr
                    className="border-b border-stone-800/80 align-top"
                    key={customer.id}
                  >
                    <td className="py-4">
                      <p className="font-medium">{customer.name}</p>
                      <p className="text-xs text-stone-500">{customer.email}</p>
                      <p className="text-xs text-stone-600">{customer.id}</p>
                      <Link
                        className="text-xs text-amber-300 underline"
                        href={`/admin/customers/${customer.id}`}
                      >
                        Customer 360
                      </Link>
                    </td>
                    <td className="py-4">
                      <AdminStatusBadge status={customer.role} />
                    </td>
                    <td className="py-4 text-sm text-stone-300">
                      {customer.isActive ? "active" : "disabled"} ·{" "}
                      {customer.emailVerified ? "verified" : "unverified"}
                    </td>
                    <td className="max-w-sm py-4 text-xs leading-5 text-stone-400">
                      {customer.permissions.length
                        ? customer.permissions.join(", ")
                        : "No staff permissions"}
                    </td>
                    <td className="py-4 text-right">
                      <CustomerAccessForm customer={customer} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </AdminTableShell>
            <AdminPagination
              basePath="/admin/customers"
              nextCursor={customers.nextCursor}
              params={{
                q: params.q,
                role: params.role,
                state: params.state,
              }}
            />
          </>
        ) : (
          <AdminEmptyState
            description="Try clearing filters or create accounts through the registration flow."
            title="No users in this page"
          />
        )}
      </AdminCard>
    </>
  );
}
