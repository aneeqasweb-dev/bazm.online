import {
  adminPermissionSchema,
  type AdminPermission,
  type UserRole,
} from "@bazm/domain";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

import { getAdminFirestore } from "../lib/firebase-admin.js";

export { adminPermissionSchema };
export type { AdminPermission };

export const CURRENT_CLAIMS_VERSION = 1;

function hasCurrentClaims(token: Record<string, unknown>) {
  return token.claimsVersion === CURRENT_CLAIMS_VERSION;
}

export async function requireActiveUser(request: CallableRequest<unknown>) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication is required.");
  }
  const token = request.auth.token as Record<string, unknown>;
  if (!hasCurrentClaims(token)) {
    throw new HttpsError(
      "permission-denied",
      "Refresh your session and try again.",
    );
  }
  if (token.isActive !== true) {
    throw new HttpsError("permission-denied", "This account is disabled.");
  }

  const profile = await getAdminFirestore()
    .collection("users")
    .doc(request.auth.uid)
    .get();
  if (!profile.exists) {
    throw new HttpsError(
      "failed-precondition",
      "The account profile is missing.",
    );
  }
  if (profile.get("isActive") !== true) {
    throw new HttpsError("permission-denied", "This account is disabled.");
  }
  return request.auth.uid;
}

function permissionsFromToken(token: Record<string, unknown>) {
  return Array.isArray(token.permissions)
    ? token.permissions.filter(
        (permission): permission is AdminPermission =>
          adminPermissionSchema.safeParse(permission).success,
      )
    : [];
}

export function hasAdminPermission(
  token: Record<string, unknown>,
  permission: AdminPermission,
) {
  if (!hasCurrentClaims(token)) return false;
  if (token.isActive !== true) return false;
  const role = token.role as UserRole | undefined;
  if (role === "ADMIN" || role === "SUPER_ADMIN") return true;
  if (role !== "STAFF") return false;
  const permissions = permissionsFromToken(token);
  return (
    permissions.includes(permission) || permissions.includes("admin.access")
  );
}

export async function requireAdminPermission(
  request: CallableRequest<unknown>,
  permission: AdminPermission,
) {
  const uid = await requireActiveUser(request);
  const token = request.auth?.token as Record<string, unknown> | undefined;
  if (!token || !hasAdminPermission(token, permission)) {
    throw new HttpsError(
      "permission-denied",
      "You do not have permission to perform this admin action.",
    );
  }
  return uid;
}
