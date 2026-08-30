import "server-only";

import { cookies } from "next/headers";

import { getServerAuth } from "@/lib/firebase/admin";
import type { AdminPermission } from "@/lib/admin/permissions";

import { authorizeSession } from "./server-authorization";

export const SESSION_COOKIE_NAME = "bazm_session";

export async function getVerifiedSession() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  try {
    return await getServerAuth().verifySessionCookie(sessionCookie, true);
  } catch {
    return null;
  }
}

export async function getAuthorizedSession(options: {
  requireVerified?: boolean;
  roles?: readonly string[];
  permissions?: readonly AdminPermission[];
  permissionMode?: "all" | "any";
}) {
  const claims = await getVerifiedSession();
  if (!claims) return { claims: null, reason: "expired" as const };

  const decision = authorizeSession(claims, options);
  if (!decision.allowed) {
    return { claims, reason: decision.reason };
  }

  return { claims, reason: null };
}
