import { adminPermissionSchema, type AdminPermission } from "@bazm/domain";

export type SessionClaims = {
  uid: string;
  email?: string;
  email_verified?: boolean;
  role?: unknown;
  isActive?: unknown;
  claimsVersion?: unknown;
  permissions?: unknown;
};

export const CURRENT_CLAIMS_VERSION = 1;

export type AuthorizationDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "disabled"
        | "stale-claims"
        | "unverified"
        | "wrong-role"
        | "missing-permission";
    };

function normalizedPermissions(claims: SessionClaims) {
  return Array.isArray(claims.permissions)
    ? claims.permissions.filter(
        (permission): permission is AdminPermission =>
          adminPermissionSchema.safeParse(permission).success,
      )
    : [];
}

function hasAdminPermission(
  claims: SessionClaims,
  permission: AdminPermission,
) {
  const role = String(claims.role);
  if (role === "ADMIN" || role === "SUPER_ADMIN") return true;
  if (role !== "STAFF") return false;
  const permissions = normalizedPermissions(claims);
  return (
    permissions.includes(permission) || permissions.includes("admin.access")
  );
}

export function authorizeSession(
  claims: SessionClaims,
  options: {
    requireVerified?: boolean;
    roles?: readonly string[];
    permissions?: readonly AdminPermission[];
    permissionMode?: "all" | "any";
  } = {},
): AuthorizationDecision {
  if (claims.isActive !== true) {
    return { allowed: false, reason: "disabled" };
  }
  if (claims.claimsVersion !== CURRENT_CLAIMS_VERSION) {
    return { allowed: false, reason: "stale-claims" };
  }
  if (options.requireVerified && claims.email_verified !== true) {
    return { allowed: false, reason: "unverified" };
  }
  if (options.roles && !options.roles.includes(String(claims.role))) {
    return { allowed: false, reason: "wrong-role" };
  }
  if (options.permissions?.length) {
    const allowed =
      options.permissionMode === "all"
        ? options.permissions.every((permission) =>
            hasAdminPermission(claims, permission),
          )
        : options.permissions.some((permission) =>
            hasAdminPermission(claims, permission),
          );
    if (!allowed) return { allowed: false, reason: "missing-permission" };
  }
  return { allowed: true };
}
