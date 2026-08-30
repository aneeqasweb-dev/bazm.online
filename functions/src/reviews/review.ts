import { DomainError } from "@bazm/domain";
import {
  HttpsError,
  onCall,
  type FunctionsErrorCode,
} from "firebase-functions/v2/https";

import { requireActiveUser } from "../auth/admin-permissions.js";
import { getAdminFirestore } from "../lib/firebase-admin.js";
import {
  createReviewCommandSchema,
  reportReviewCommandSchema,
  ReviewService,
  updateReviewCommandSchema,
} from "./review-service.js";

const options = {
  region: "asia-south1",
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true",
};

const service = () => new ReviewService(getAdminFirestore());

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

export const createReview = onCall(options, async (request) => {
  const userId = await requireActiveUser(request);
  const input = createReviewCommandSchema.safeParse(request.data);
  if (!input.success) {
    throw new HttpsError("invalid-argument", "Enter valid review details.");
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

export const updateReview = onCall(options, async (request) => {
  const userId = await requireActiveUser(request);
  const input = updateReviewCommandSchema.safeParse(request.data);
  if (!input.success) {
    throw new HttpsError("invalid-argument", "Enter valid review changes.");
  }
  try {
    return {
      ok: true as const,
      ...(await service().update(
        userId,
        input.data.reviewId,
        input.data.input,
      )),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});

export const reportReview = onCall(options, async (request) => {
  const userId = await requireActiveUser(request);
  const input = reportReviewCommandSchema.safeParse(request.data);
  if (!input.success) {
    throw new HttpsError("invalid-argument", "Enter valid report details.");
  }
  try {
    return {
      ok: true as const,
      ...(await service().report(userId, input.data)),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});
