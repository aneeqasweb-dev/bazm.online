import { DomainError, documentIdSchema } from "@bazm/domain";
import {
  HttpsError,
  onCall,
  type FunctionsErrorCode,
} from "firebase-functions/v2/https";

import { requireAdminPermission } from "../auth/admin-permissions.js";
import { getAdminFirestore } from "../lib/firebase-admin.js";
import {
  CategoryService,
  categoryStatusCommandSchema,
  createCategoryCommandSchema,
  reorderCategoriesCommandSchema,
  updateCategoryCommandSchema,
} from "./category-service.js";

function toHttpsError(error: unknown): never {
  if (error instanceof DomainError) {
    const errorCodeMap: Record<DomainError["code"], FunctionsErrorCode> = {
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
    const code = errorCodeMap[error.code];
    throw new HttpsError(code, error.message);
  }
  throw error;
}

function categoryService() {
  return new CategoryService(getAdminFirestore());
}

const callableOptions = {
  region: "asia-south1",
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true",
};

export const createCategory = onCall(callableOptions, async (request) => {
  await requireAdminPermission(request, "catalog.manage");
  const parsed = createCategoryCommandSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", "Enter valid category details.");
  }
  try {
    return {
      ok: true as const,
      ...(await categoryService().create(parsed.data)),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});

export const updateCategory = onCall(callableOptions, async (request) => {
  await requireAdminPermission(request, "catalog.manage");
  const payload = request.data as { id?: unknown; input?: unknown };
  const id = documentIdSchema.safeParse(payload?.id);
  const input = updateCategoryCommandSchema.safeParse(payload?.input);
  if (!id.success || !input.success) {
    throw new HttpsError("invalid-argument", "Enter valid category details.");
  }
  try {
    return {
      ok: true as const,
      ...(await categoryService().update(id.data, input.data)),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});

export const setCategoryStatus = onCall(callableOptions, async (request) => {
  await requireAdminPermission(request, "catalog.manage");
  const parsed = categoryStatusCommandSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", "Enter a valid category status.");
  }
  try {
    return {
      ok: true as const,
      ...(await categoryService().setStatus(parsed.data)),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});

export const reorderCategories = onCall(callableOptions, async (request) => {
  await requireAdminPermission(request, "catalog.manage");
  const parsed = reorderCategoriesCommandSchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError(
      "invalid-argument",
      "Enter a complete category order.",
    );
  }
  try {
    return {
      ok: true as const,
      ...(await categoryService().reorder(parsed.data)),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});
