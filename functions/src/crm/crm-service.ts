import {
  createSupportTicketInputSchema,
  customerActivityTypeSchema,
  documentIdSchema,
  DomainError,
  supportTicketStatusSchema,
  type UserRole,
} from "@bazm/domain";
import { randomUUID } from "node:crypto";
import {
  FieldValue,
  Timestamp,
  type Firestore,
} from "firebase-admin/firestore";
import { z } from "zod";

export const createTicketCommandSchema = createSupportTicketInputSchema;
export const replyToTicketCommandSchema = z
  .object({
    ticketId: documentIdSchema,
    message: z.string().trim().min(1).max(4_000),
  })
  .strict();
export const manageTicketCommandSchema = z
  .object({
    ticketId: documentIdSchema,
    status: supportTicketStatusSchema,
    assignedStaffId: documentIdSchema.nullable().optional(),
    message: z.string().trim().min(1).max(4_000).optional(),
  })
  .strict();
export const recordActivityCommandSchema = z
  .object({
    type: customerActivityTypeSchema.exclude([
      "ACCOUNT_CREATED",
      "ORDER_PLACED",
      "SUPPORT_TICKET_CREATED",
    ]),
    context: z
      .record(z.string().trim().min(1).max(40), z.string().trim().max(200))
      .default({}),
  })
  .strict();

const transitions: Record<string, readonly string[]> = {
  OPEN: ["IN_PROGRESS", "WAITING_ON_CUSTOMER", "RESOLVED", "CLOSED"],
  IN_PROGRESS: ["WAITING_ON_CUSTOMER", "RESOLVED", "CLOSED"],
  WAITING_ON_CUSTOMER: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  RESOLVED: ["IN_PROGRESS", "CLOSED"],
  CLOSED: [],
};

function metadata(context: Record<string, string>) {
  return Object.fromEntries(Object.entries(context).slice(0, 10));
}

export class CrmService {
  constructor(private readonly firestore: Firestore) {}

  async createTicket(
    userId: string,
    input: z.infer<typeof createTicketCommandSchema>,
  ) {
    if (input.relatedOrderId) {
      const order = await this.firestore
        .collection("orders")
        .doc(input.relatedOrderId)
        .get();
      if (!order.exists || order.get("userId") !== userId) {
        throw new DomainError("NOT_FOUND", "The related order was not found.");
      }
    }
    const reference = this.firestore.collection("supportTickets").doc();
    const activity = this.firestore.collection("customerActivities").doc();
    const batch = this.firestore.batch();
    batch.create(reference, {
      userId,
      subject: input.subject,
      initialMessage: input.message,
      status: "OPEN",
      assignedStaffId: null,
      relatedOrderId: input.relatedOrderId,
      archivedAt: null,
      schemaVersion: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.create(reference.collection("messages").doc(), {
      authorId: userId,
      authorRole: "CUSTOMER",
      body: input.message,
      schemaVersion: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.create(activity, {
      userId,
      type: "SUPPORT_TICKET_CREATED",
      context: { ticketId: reference.id },
      expiresAt: Timestamp.fromMillis(Date.now() + 180 * 86_400_000),
      schemaVersion: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    return { id: reference.id, status: "OPEN" as const };
  }

  async reply(
    userId: string,
    role: UserRole,
    ticketId: string,
    message: string,
  ) {
    return this.firestore.runTransaction(async (transaction) => {
      const reference = this.firestore
        .collection("supportTickets")
        .doc(ticketId);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists)
        throw new DomainError("NOT_FOUND", "The ticket does not exist.");
      if (role === "CUSTOMER" && snapshot.get("userId") !== userId)
        throw new DomainError(
          "FORBIDDEN",
          "This ticket belongs to another customer.",
        );
      if (snapshot.get("status") === "CLOSED")
        throw new DomainError(
          "PRECONDITION_FAILED",
          "Closed tickets cannot receive replies.",
        );
      transaction.create(reference.collection("messages").doc(), {
        authorId: userId,
        authorRole: role,
        body: message,
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(reference, {
        status: role === "CUSTOMER" ? "IN_PROGRESS" : "WAITING_ON_CUSTOMER",
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { id: ticketId };
    });
  }

  async manage(
    actorId: string,
    input: z.infer<typeof manageTicketCommandSchema>,
  ) {
    return this.firestore.runTransaction(async (transaction) => {
      const reference = this.firestore
        .collection("supportTickets")
        .doc(input.ticketId);
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists)
        throw new DomainError("NOT_FOUND", "The ticket does not exist.");
      const current = String(snapshot.get("status"));
      if (
        current !== input.status &&
        !transitions[current]?.includes(input.status)
      ) {
        throw new DomainError(
          "PRECONDITION_FAILED",
          `A ${current} ticket cannot move to ${input.status}.`,
        );
      }
      if (input.assignedStaffId) {
        const assignee = await transaction.get(
          this.firestore.collection("users").doc(input.assignedStaffId),
        );
        if (
          !assignee.exists ||
          !["STAFF", "ADMIN", "SUPER_ADMIN"].includes(
            String(assignee.get("role")),
          ) ||
          assignee.get("isActive") !== true
        ) {
          throw new DomainError(
            "INVALID_ARGUMENT",
            "Choose an active staff member.",
          );
        }
      }
      transaction.update(reference, {
        status: input.status,
        ...(input.assignedStaffId !== undefined
          ? { assignedStaffId: input.assignedStaffId }
          : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (input.message)
        transaction.create(reference.collection("messages").doc(), {
          authorId: actorId,
          authorRole: "STAFF",
          body: input.message,
          schemaVersion: 1,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      transaction.create(this.firestore.collection("auditLogs").doc(), {
        action: "SUPPORT",
        actorId,
        targetType: "supportTicket",
        targetId: input.ticketId,
        metadata: { previousStatus: current, nextStatus: input.status },
        correlationId: `crm-${randomUUID()}`,
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { id: input.ticketId, status: input.status };
    });
  }

  async recordActivity(
    userId: string,
    input: z.infer<typeof recordActivityCommandSchema>,
  ) {
    const user = await this.firestore.collection("users").doc(userId).get();
    if (!user.exists || user.get("preferences.analytics") !== true)
      return { recorded: false };
    await this.firestore.collection("customerActivities").add({
      userId,
      type: input.type,
      context: metadata(input.context),
      expiresAt: Timestamp.fromMillis(Date.now() + 90 * 86_400_000),
      schemaVersion: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { recorded: true };
  }
}
