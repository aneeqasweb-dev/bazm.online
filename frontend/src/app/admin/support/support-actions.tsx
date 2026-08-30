"use client";

import { useCallableAction } from "@/components/admin/callable-action";

const statuses = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_ON_CUSTOMER",
  "RESOLVED",
  "CLOSED",
];
export function SupportTicketForm({
  ticket,
}: {
  ticket: { id: string; status: string; assignedStaffId: string | null };
}) {
  const { message, pending, run } = useCallableAction("manageSupportTicket");
  return (
    <form
      className="grid min-w-64 gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const status = String(form.get("status"));
        if (
          status === "CLOSED" &&
          !window.confirm("Close this support ticket?")
        )
          return;
        await run(
          {
            ticketId: ticket.id,
            status,
            assignedStaffId:
              String(form.get("assignedStaffId") ?? "").trim() || null,
            message: String(form.get("message") ?? "").trim() || undefined,
          },
          "Ticket updated.",
        );
      }}
    >
      <select className="field mt-0" defaultValue={ticket.status} name="status">
        {statuses.map((status) => (
          <option key={status}>{status}</option>
        ))}
      </select>
      <input
        className="field mt-0"
        defaultValue={ticket.assignedStaffId ?? ""}
        name="assignedStaffId"
        placeholder="Staff user ID (optional)"
      />
      <textarea
        className="field mt-0"
        name="message"
        placeholder="Reply (optional)"
        rows={2}
      />
      <button
        className="rounded-full bg-amber-300 px-3 py-2 text-xs font-semibold text-stone-950"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving…" : "Update ticket"}
      </button>
      {message ? <p className="text-xs text-stone-400">{message}</p> : null}
    </form>
  );
}
