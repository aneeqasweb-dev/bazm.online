import { DomainError, inventoryReservationDocumentSchema } from "@bazm/domain";
import {
  HttpsError,
  onCall,
  type CallableRequest,
  type FunctionsErrorCode,
} from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

import {
  hasAdminPermission,
  requireActiveUser,
  requireAdminPermission,
} from "../auth/admin-permissions.js";
import { getAdminFirestore } from "../lib/firebase-admin.js";
import {
  InventoryService,
  inventoryAdjustmentCommandSchema,
  inventoryQuantityCommandSchema,
  receiveInventoryCommandSchema,
  reservationIdCommandSchema,
  reserveInventoryCommandSchema,
} from "./inventory-service.js";

const options = {
  region: "asia-south1",
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true",
};
const service = () => new InventoryService(getAdminFirestore());

async function requireInventoryAdmin(request: CallableRequest<unknown>) {
  return requireAdminPermission(request, "inventory.manage");
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

export const receiveInventory = onCall(options, async (request) => {
  const actorId = await requireInventoryAdmin(request);
  const input = receiveInventoryCommandSchema.safeParse(request.data);
  if (!input.success)
    throw new HttpsError("invalid-argument", "Enter a valid stock receipt.");
  try {
    return {
      ok: true as const,
      ...(await service().receive(input.data, actorId)),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});

export const adjustInventory = onCall(options, async (request) => {
  const actorId = await requireInventoryAdmin(request);
  const input = inventoryAdjustmentCommandSchema.safeParse(request.data);
  if (!input.success)
    throw new HttpsError("invalid-argument", "Enter a valid stock adjustment.");
  try {
    return {
      ok: true as const,
      ...(await service().adjust(input.data, actorId)),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});

export const restoreInventoryReturn = onCall(options, async (request) => {
  const actorId = await requireInventoryAdmin(request);
  const input = inventoryQuantityCommandSchema.safeParse(request.data);
  if (!input.success)
    throw new HttpsError(
      "invalid-argument",
      "Enter a valid returned quantity.",
    );
  try {
    return {
      ok: true as const,
      ...(await service().restoreReturn(input.data, actorId)),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});

export const recordInventoryDamage = onCall(options, async (request) => {
  const actorId = await requireInventoryAdmin(request);
  const input = inventoryQuantityCommandSchema.safeParse(request.data);
  if (!input.success)
    throw new HttpsError("invalid-argument", "Enter a valid damaged quantity.");
  try {
    return {
      ok: true as const,
      ...(await service().recordDamage(input.data, actorId)),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});

export const reserveInventory = onCall(options, async (request) => {
  const userId = await requireActiveUser(request);
  const input = reserveInventoryCommandSchema.safeParse(request.data);
  if (!input.success)
    throw new HttpsError("invalid-argument", "Enter valid reservation lines.");
  try {
    return {
      ok: true as const,
      ...(await service().reserve(input.data, userId)),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});

export const releaseInventoryReservation = onCall(options, async (request) => {
  const userId = await requireActiveUser(request);
  const input = reservationIdCommandSchema.safeParse(request.data);
  if (!input.success)
    throw new HttpsError("invalid-argument", "Select a valid reservation.");
  const snapshot = await getAdminFirestore()
    .collection("inventoryReservations")
    .doc(input.data.reservationId)
    .get();
  if (!snapshot.exists)
    throw new HttpsError("not-found", "The inventory reservation is missing.");
  const reservation = inventoryReservationDocumentSchema.parse(snapshot.data());
  const token = request.auth?.token as Record<string, unknown> | undefined;
  const isAdmin = token ? hasAdminPermission(token, "inventory.manage") : false;
  if (!isAdmin && reservation.userId !== userId)
    throw new HttpsError(
      "permission-denied",
      "This reservation belongs to another customer.",
    );
  try {
    return {
      ok: true as const,
      ...(await service().release(
        input.data.reservationId,
        userId,
        "Reservation cancelled by the customer.",
      )),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});

export const finalizeInventoryReservation = onCall(options, async (request) => {
  const actorId = await requireInventoryAdmin(request);
  const input = reservationIdCommandSchema.safeParse(request.data);
  if (!input.success)
    throw new HttpsError("invalid-argument", "Select a valid reservation.");
  try {
    return {
      ok: true as const,
      ...(await service().finalize(input.data.reservationId, actorId)),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});

/** Operational backstop used by administrators and by the scheduled job. */
export const runInventoryExpiryCleanup = onCall(options, async (request) => {
  await requireInventoryAdmin(request);
  return { ok: true as const, ...(await service().expireActiveReservations()) };
});

export const expireInventoryReservations = onSchedule(
  { region: "asia-south1", schedule: "every 5 minutes" },
  async () => {
    await service().expireActiveReservations();
  },
);
