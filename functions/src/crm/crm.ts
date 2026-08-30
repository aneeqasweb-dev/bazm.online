import { DomainError, userRoleSchema } from "@bazm/domain";
import {
  HttpsError,
  onCall,
  type FunctionsErrorCode,
} from "firebase-functions/v2/https";
import {
  requireActiveUser,
  requireAdminPermission,
} from "../auth/admin-permissions.js";
import { getAdminFirestore } from "../lib/firebase-admin.js";
import {
  CrmService,
  createTicketCommandSchema,
  manageTicketCommandSchema,
  recordActivityCommandSchema,
  replyToTicketCommandSchema,
} from "./crm-service.js";

const options = {
  region: "asia-south1",
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true",
};
const service = () => new CrmService(getAdminFirestore());
function fail(error: unknown): never {
  if (error instanceof DomainError) {
    const codes: Record<DomainError["code"], FunctionsErrorCode> = {
      INVALID_ARGUMENT: "invalid-argument",
      NOT_FOUND: "not-found",
      CONFLICT: "already-exists",
      PRECONDITION_FAILED: "failed-precondition",
      FORBIDDEN: "permission-denied",
      UNAUTHENTICATED: "unauthenticated",
      RATE_LIMITED: "resource-exhausted",
      UNAVAILABLE: "unavailable",
      INTERNAL: "internal",
    };
    throw new HttpsError(codes[error.code], error.message);
  }
  throw error;
}
function parse<T>(
  schema: {
    safeParse(value: unknown): { success: true; data: T } | { success: false };
  },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new HttpsError("invalid-argument", "Enter valid CRM details.");
  return result.data;
}
export const createSupportTicket = onCall(options, async (request) => {
  const uid = await requireActiveUser(request);
  try {
    return {
      ok: true,
      ...(await service().createTicket(
        uid,
        parse(createTicketCommandSchema, request.data),
      )),
    };
  } catch (error) {
    return fail(error);
  }
});
export const replyToSupportTicket = onCall(options, async (request) => {
  const uid = await requireActiveUser(request);
  const input = parse(replyToTicketCommandSchema, request.data);
  const role = userRoleSchema.catch("CUSTOMER").parse(request.auth?.token.role);
  try {
    return {
      ok: true,
      ...(await service().reply(uid, role, input.ticketId, input.message)),
    };
  } catch (error) {
    return fail(error);
  }
});
export const manageSupportTicket = onCall(options, async (request) => {
  const uid = await requireAdminPermission(request, "support.manage");
  try {
    return {
      ok: true,
      ...(await service().manage(
        uid,
        parse(manageTicketCommandSchema, request.data),
      )),
    };
  } catch (error) {
    return fail(error);
  }
});
export const recordCustomerActivity = onCall(options, async (request) => {
  const uid = await requireActiveUser(request);
  try {
    return {
      ok: true,
      ...(await service().recordActivity(
        uid,
        parse(recordActivityCommandSchema, request.data),
      )),
    };
  } catch (error) {
    return fail(error);
  }
});
