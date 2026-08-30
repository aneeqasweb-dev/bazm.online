import { DomainError } from "@bazm/domain";
import {
  HttpsError,
  onCall,
  type FunctionsErrorCode,
} from "firebase-functions/v2/https";

import { requireActiveUser } from "../auth/admin-permissions.js";
import { getAdminFirestore } from "../lib/firebase-admin.js";
import { createReturnCommandSchema, ReturnService } from "./return-service.js";

const options = {
  region: "asia-south1",
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true",
};

const service = () => new ReturnService(getAdminFirestore());

function toHttpsError(error: unknown): never {
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

export const createReturn = onCall(options, async (request) => {
  const userId = await requireActiveUser(request);
  const input = createReturnCommandSchema.safeParse(request.data);
  if (!input.success) {
    throw new HttpsError("invalid-argument", "Enter valid return details.");
  }
  try {
    return {
      ok: true as const,
      ...(await service().create(userId, input.data)),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});
