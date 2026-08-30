import "server-only";

import { redirect } from "next/navigation";

import { getAuthorizedSession } from "@/lib/auth/server-session";

import {
  ALL_ADMIN_MODULE_PERMISSIONS,
  type AdminPermission,
} from "./permissions";

const ADMIN_ROLES = ["STAFF", "ADMIN", "SUPER_ADMIN"] as const;

function redirectForReason(reason: string | null, next: string) {
  if (reason === "expired" || reason === "stale-claims")
    redirect(`/login?reason=session-expired&next=${next}`);
  if (reason === "disabled") redirect("/login?reason=disabled");
  if (reason === "unverified") redirect("/verify-email");
  if (reason === "wrong-role" || reason === "missing-permission") {
    redirect("/unauthorized");
  }
}

export async function requireAdminSession(
  next: string,
  permissions: readonly AdminPermission[] = ALL_ADMIN_MODULE_PERMISSIONS,
  permissionMode: "all" | "any" = "any",
) {
  const session = await getAuthorizedSession({
    requireVerified: true,
    roles: ADMIN_ROLES,
    permissions,
    permissionMode,
  });
  redirectForReason(session.reason, next);
  return session.claims;
}
