import { DomainError, documentIdSchema } from "@bazm/domain";
import {
  HttpsError,
  onCall,
  type CallableRequest,
  type FunctionsErrorCode,
} from "firebase-functions/v2/https";
import { z } from "zod";

import {
  requireActiveUser,
  requireAdminPermission,
} from "../auth/admin-permissions.js";
import { getAdminFirestore } from "../lib/firebase-admin.js";
import {
  checkoutCommandSchema,
  OrderService,
  orderTransitionCommandSchema,
} from "./order-service.js";

const options = {
  region: "asia-south1",
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true",
};
const service = () => new OrderService(getAdminFirestore());

async function requireOrderAdmin(request: CallableRequest<unknown>) {
  return requireAdminPermission(request, "orders.manage");
}

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

export const createAddress = onCall(options, async (request) => {
  const uid = await requireActiveUser(request);
  try {
    return {
      ok: true as const,
      ...(await service().createAddress(uid, request.data)),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});

export const updateAddress = onCall(options, async (request) => {
  const uid = await requireActiveUser(request);
  const payload = request.data as { id?: unknown; input?: unknown };
  const id = documentIdSchema.safeParse(payload?.id);
  if (!id.success)
    throw new HttpsError("invalid-argument", "Select a valid address.");
  try {
    return {
      ok: true as const,
      ...(await service().updateAddress(uid, id.data, payload.input)),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});

export const createCheckout = onCall(options, async (request) => {
  const uid = await requireActiveUser(request);
  const input = checkoutCommandSchema.safeParse(request.data);
  if (!input.success)
    throw new HttpsError(
      "invalid-argument",
      "Enter complete checkout details.",
    );
  try {
    return {
      ok: true as const,
      ...(await service().checkout(uid, input.data)),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});

export const cancelMyOrder = onCall(options, async (request) => {
  const uid = await requireActiveUser(request);
  const input = z
    .object({ orderId: documentIdSchema })
    .strict()
    .safeParse(request.data);
  if (!input.success)
    throw new HttpsError("invalid-argument", "Select a valid order.");
  try {
    return {
      ok: true as const,
      ...(await service().cancel(uid, input.data.orderId)),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});

export const transitionOrder = onCall(options, async (request) => {
  const actorId = await requireOrderAdmin(request);
  const input = orderTransitionCommandSchema.safeParse(request.data);
  if (!input.success)
    throw new HttpsError("invalid-argument", "Enter a valid order transition.");
  try {
    return {
      ok: true as const,
      ...(await service().transition(actorId, input.data)),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});
