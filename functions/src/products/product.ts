import { DomainError, documentIdSchema } from "@bazm/domain";
import {
  HttpsError,
  onCall,
  type FunctionsErrorCode,
} from "firebase-functions/v2/https";

import { requireAdminPermission } from "../auth/admin-permissions.js";
import { getAdminFirestore } from "../lib/firebase-admin.js";
import {
  ProductService,
  createProductCommandSchema,
  createVariantCommandSchema,
  productStatusCommandSchema,
  updateProductCommandSchema,
  updateVariantCommandSchema,
} from "./product-service.js";

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

const options = {
  region: "asia-south1",
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true",
};
const service = () => new ProductService(getAdminFirestore());

export const createProduct = onCall(options, async (request) => {
  await requireAdminPermission(request, "catalog.manage");
  const input = createProductCommandSchema.safeParse(request.data);
  if (!input.success)
    throw new HttpsError("invalid-argument", "Enter valid product details.");
  try {
    return { ok: true as const, ...(await service().create(input.data)) };
  } catch (error) {
    return toHttpsError(error);
  }
});

export const updateProduct = onCall(options, async (request) => {
  await requireAdminPermission(request, "catalog.manage");
  const payload = request.data as { id?: unknown; input?: unknown };
  const id = documentIdSchema.safeParse(payload?.id);
  const input = updateProductCommandSchema.safeParse(payload?.input);
  if (!id.success || !input.success)
    throw new HttpsError("invalid-argument", "Enter valid product details.");
  try {
    return {
      ok: true as const,
      ...(await service().update(id.data, input.data)),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});

export const setProductStatus = onCall(options, async (request) => {
  await requireAdminPermission(request, "catalog.manage");
  const input = productStatusCommandSchema.safeParse(request.data);
  if (!input.success)
    throw new HttpsError("invalid-argument", "Enter a valid product status.");
  try {
    return { ok: true as const, ...(await service().setStatus(input.data)) };
  } catch (error) {
    return toHttpsError(error);
  }
});

export const createProductVariant = onCall(options, async (request) => {
  await requireAdminPermission(request, "catalog.manage");
  const input = createVariantCommandSchema.safeParse(request.data);
  if (!input.success)
    throw new HttpsError("invalid-argument", "Enter valid variant details.");
  try {
    return {
      ok: true as const,
      ...(await service().createVariant(input.data)),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});

export const updateProductVariant = onCall(options, async (request) => {
  await requireAdminPermission(request, "catalog.manage");
  const input = updateVariantCommandSchema.safeParse(request.data);
  if (!input.success)
    throw new HttpsError("invalid-argument", "Enter valid variant details.");
  try {
    return {
      ok: true as const,
      ...(await service().updateVariant(input.data)),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});
