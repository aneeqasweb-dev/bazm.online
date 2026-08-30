import Link from "next/link";
import {
  AdminCard,
  AdminEmptyState,
  AdminPageHeader,
  AdminPagination,
  AdminStatusBadge,
  AdminTableShell,
} from "@/components/admin/admin-ui";
import { listSupportTickets } from "@/lib/admin/admin-data";
import { requireAdminSession } from "@/lib/admin/server-auth";
import { SupportTicketForm } from "./support-actions";

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ after?: string; q?: string; status?: string }>;
}) {
  await requireAdminSession("/admin/support", ["support.manage"]);
  const params = await searchParams;
  const tickets = await listSupportTickets(params);
  return (
    <>
      <AdminPageHeader
        eyebrow="Customer care"
        title="Support tickets"
        description="Ownership-protected requests with assignment, response history, controlled transitions, and audit logs."
      />
      <AdminCard>
        <form className="flex gap-3" method="get">
          <input
            className="field mt-0 max-w-xs"
            defaultValue={params.q ?? ""}
            name="q"
            placeholder="Ticket, customer, or subject"
          />
          <select
            className="field mt-0 max-w-xs"
            defaultValue={params.status ?? "ALL"}
            name="status"
          >
            <option>ALL</option>
            <option>OPEN</option>
            <option>IN_PROGRESS</option>
            <option>WAITING_ON_CUSTOMER</option>
            <option>RESOLVED</option>
            <option>CLOSED</option>
          </select>
          <button
            className="rounded-full border border-stone-700 px-4"
            type="submit"
          >
            Apply
          </button>
        </form>
        {tickets.items.length ? (
          <>
            <AdminTableShell minWidth="980px">
              <tbody>
                {tickets.items.map((ticket) => (
                  <tr
                    className="border-b border-stone-800 align-top"
                    key={ticket.id}
                  >
                    <td className="py-4">
                      <p className="font-medium">{ticket.subject}</p>
                      <p className="text-xs text-stone-500">{ticket.id}</p>
                      <Link
                        className="text-xs underline"
                        href={`/admin/customers/${ticket.userId}`}
                      >
                        {ticket.userId}
                      </Link>
                    </td>
                    <td className="py-4">
                      <AdminStatusBadge status={ticket.status} />
                      <p className="mt-2 text-xs text-stone-500">
                        {new Date(ticket.updatedAt).toLocaleString("en-PK")}
                      </p>
                    </td>
                    <td className="py-4">
                      <SupportTicketForm ticket={ticket} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </AdminTableShell>
            <AdminPagination
              basePath="/admin/support"
              nextCursor={tickets.nextCursor}
              params={{ q: params.q, status: params.status }}
            />
          </>
        ) : (
          <AdminEmptyState
            title="No support tickets"
            description="New customer requests will appear here."
          />
        )}
      </AdminCard>
    </>
  );
}
