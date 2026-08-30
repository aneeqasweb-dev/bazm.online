"use client";

import { useCallableAction } from "@/components/admin/callable-action";

type Ticket = {
  id: string;
  subject: string;
  status: string;
  relatedOrderId: string | null;
  updatedAt: string;
  messages: {
    id: string;
    body: string;
    authorRole: string;
    createdAt: string;
  }[];
};

function NewTicketForm() {
  const { message, pending, run } = useCallableAction("createSupportTicket");
  return (
    <form
      className="mt-4 grid gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const target = event.currentTarget;
        const form = new FormData(target);
        const saved = await run(
          {
            subject: String(form.get("subject")),
            message: String(form.get("message")),
            relatedOrderId:
              String(form.get("relatedOrderId") ?? "").trim() || null,
          },
          "Support request created.",
        );
        if (saved) target.reset();
      }}
    >
      <input
        className="field"
        minLength={5}
        name="subject"
        placeholder="What can we help with?"
        required
      />
      <input
        className="field"
        name="relatedOrderId"
        placeholder="Related order ID (optional)"
      />
      <textarea
        className="field"
        minLength={10}
        name="message"
        placeholder="Describe the issue"
        required
        rows={4}
      />
      <button
        className="rounded-full bg-amber-300 px-5 py-3 font-semibold text-stone-950 disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Sending…" : "Create support request"}
      </button>
      {message ? (
        <p aria-live="polite" className="text-sm text-stone-400">
          {message}
        </p>
      ) : null}
    </form>
  );
}

function ReplyForm({ ticketId }: { ticketId: string }) {
  const { message, pending, run } = useCallableAction("replyToSupportTicket");
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const target = event.currentTarget;
        const form = new FormData(target);
        if (
          await run(
            { ticketId, message: String(form.get("message")) },
            "Reply sent.",
          )
        )
          target.reset();
      }}
    >
      <input
        className="field mt-0"
        name="message"
        placeholder="Add a reply"
        required
      />
      <button
        className="rounded-full border border-stone-600 px-4 text-sm"
        disabled={pending}
        type="submit"
      >
        Reply
      </button>
      {message ? (
        <span className="sr-only" aria-live="polite">
          {message}
        </span>
      ) : null}
    </form>
  );
}

export function SupportCenter({ tickets }: { tickets: Ticket[] }) {
  return (
    <section className="mt-10 border-t border-stone-800 pt-8">
      <p className="text-sm tracking-[0.2em] text-amber-300 uppercase">
        Customer care
      </p>
      <h2 className="mt-2 text-2xl font-semibold">Support requests</h2>
      <NewTicketForm />
      <div className="mt-8 space-y-4">
        {tickets.length ? (
          tickets.map((ticket) => (
            <article
              className="rounded-2xl border border-stone-800 p-4"
              key={ticket.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{ticket.subject}</h3>
                  <p className="text-xs text-stone-500">
                    {ticket.id}
                    {ticket.relatedOrderId
                      ? ` · order ${ticket.relatedOrderId}`
                      : ""}
                  </p>
                </div>
                <span className="rounded-full bg-stone-800 px-3 py-1 text-xs">
                  {ticket.status.toLowerCase().replaceAll("_", " ")}
                </span>
              </div>
              <ol className="mt-4 space-y-2">
                {ticket.messages.map((item) => (
                  <li
                    className="rounded-xl bg-stone-950 p-3 text-sm"
                    key={item.id}
                  >
                    <p>{item.body}</p>
                    <p className="mt-1 text-xs text-stone-500">
                      {item.authorRole.toLowerCase()} ·{" "}
                      {new Date(item.createdAt).toLocaleString("en-PK")}
                    </p>
                  </li>
                ))}
              </ol>
              {ticket.status !== "CLOSED" ? (
                <ReplyForm ticketId={ticket.id} />
              ) : null}
            </article>
          ))
        ) : (
          <p className="text-sm text-stone-400">
            You have no support requests yet.
          </p>
        )}
      </div>
    </section>
  );
}
