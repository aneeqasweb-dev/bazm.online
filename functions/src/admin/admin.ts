import { DomainError, userRoleSchema } from "@bazm/domain";
import {
  HttpsError,
  onCall,
  type FunctionsErrorCode,
} from "firebase-functions/v2/https";

import { requireAdminPermission } from "../auth/admin-permissions.js";
import { getAdminAuth, getAdminFirestore } from "../lib/firebase-admin.js";
import {
  AdminOperationsService,
  couponStatusCommandSchema,
  createCouponCommandSchema,
  moderateReviewCommandSchema,
  updateCouponCommandSchema,
  updateReturnStatusCommandSchema,
  updateUserAccessCommandSchema,
  upsertSettingsCommandSchema,
} from "./admin-service.js";

const options = {
  region: "asia-south1",
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true",
};

function service() {
  return new AdminOperationsService(getAdminFirestore(), getAdminAuth());
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

function actorRole(role: unknown) {
  const parsed = userRoleSchema.safeParse(role);
  if (!parsed.success) {
    throw new HttpsError(
      "permission-denied",
      "Administrator access is required.",
    );
  }
  return parsed.data;
}

export const updateUserAccess = onCall(options, async (request) => {
  const actorId = await requireAdminPermission(request, "customers.manage");
  const input = updateUserAccessCommandSchema.safeParse(request.data);
  if (!input.success) {
    throw new HttpsError(
      "invalid-argument",
      "Enter valid user access details.",
    );
  }
  try {
    return {
      ok: true as const,
      ...(await service().updateUserAccess(
        actorId,
        actorRole(request.auth?.token.role),
        input.data,
      )),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});

export const createCoupon = onCall(options, async (request) => {
  const actorId = await requireAdminPermission(request, "coupons.manage");
  const input = createCouponCommandSchema.safeParse(request.data);
  if (!input.success) {
    throw new HttpsError("invalid-argument", "Enter valid coupon details.");
  }
  try {
    return {
      ok: true as const,
      ...(await service().createCoupon(actorId, input.data)),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});

export const updateCoupon = onCall(options, async (request) => {
  const actorId = await requireAdminPermission(request, "coupons.manage");
  const input = updateCouponCommandSchema.safeParse(request.data);
  if (!input.success) {
    throw new HttpsError("invalid-argument", "Enter valid coupon details.");
  }
  try {
    return {
      ok: true as const,
      ...(await service().updateCoupon(actorId, input.data)),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});

export const setCouponStatus = onCall(options, async (request) => {
  const actorId = await requireAdminPermission(request, "coupons.manage");
  const input = couponStatusCommandSchema.safeParse(request.data);
  if (!input.success) {
    throw new HttpsError("invalid-argument", "Enter a valid coupon status.");
  }
  try {
    return {
      ok: true as const,
      ...(await service().setCouponStatus(actorId, input.data)),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});

export const moderateReview = onCall(options, async (request) => {
  const actorId = await requireAdminPermission(request, "reviews.manage");
  const input = moderateReviewCommandSchema.safeParse(request.data);
  if (!input.success) {
    throw new HttpsError("invalid-argument", "Enter valid moderation details.");
  }
  try {
    return {
      ok: true as const,
      ...(await service().moderateReview(actorId, input.data)),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});

export const updateReturnStatus = onCall(options, async (request) => {
  const actorId = await requireAdminPermission(request, "returns.manage");
  const input = updateReturnStatusCommandSchema.safeParse(request.data);
  if (!input.success) {
    throw new HttpsError("invalid-argument", "Enter valid return details.");
  }
  try {
    return {
      ok: true as const,
      ...(await service().updateReturnStatus(actorId, input.data)),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});

export const upsertSettings = onCall(options, async (request) => {
  const actorId = await requireAdminPermission(request, "settings.manage");
  const input = upsertSettingsCommandSchema.safeParse(request.data);
  if (!input.success) {
    throw new HttpsError("invalid-argument", "Enter valid settings JSON.");
  }
  try {
    return {
      ok: true as const,
      ...(await service().upsertSettings(actorId, input.data)),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});
