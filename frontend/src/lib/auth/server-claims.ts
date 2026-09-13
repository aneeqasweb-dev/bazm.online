import "server-only";

import { adminPermissionSchema, userRoleSchema } from "@bazm/domain";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";

import { getServerAuth, getServerFirestore } from "@/lib/firebase/admin";

const trustedProfileSchema = z.object({
  role: userRoleSchema,
  isActive: z.boolean(),
  permissions: z.array(adminPermissionSchema).max(50).optional(),
});

export class AuthorizationSyncError extends Error {
  constructor(public readonly code: "DISABLED" | "MISSING" | "INVALID") {
    super(code);
  }
}

export async function synchronizeAuthorizationForUid(uid: string) {
  const profileReference = getServerFirestore().collection("users").doc(uid);
  const [profileSnapshot, authUser] = await Promise.all([
    profileReference.get(),
    getServerAuth().getUser(uid),
  ]);
  if (!profileSnapshot.exists) throw new AuthorizationSyncError("MISSING");

  const profile = trustedProfileSchema.safeParse(profileSnapshot.data());
  if (!profile.success) throw new AuthorizationSyncError("INVALID");

  const active = profile.data.isActive && !authUser.disabled;
  const claims: Record<string, unknown> = {
    role: profile.data.role,
    isActive: active,
    claimsVersion: 1,
  };
  if (profile.data.role === "STAFF" && profile.data.permissions?.length) {
    claims.permissions = profile.data.permissions;
  }

  await Promise.all([
    getServerAuth().setCustomUserClaims(uid, claims),
    profileReference.update({
      emailVerified: authUser.emailVerified,
      updatedAt: FieldValue.serverTimestamp(),
    }),
  ]);
  if (!active) {
    await getServerAuth().revokeRefreshTokens(uid);
    throw new AuthorizationSyncError("DISABLED");
  }
  return {
    ok: true as const,
    role: profile.data.role,
    emailVerified: authUser.emailVerified,
  };
}

export async function verifyBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) return null;
  try {
    return await getServerAuth().verifyIdToken(token, true);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("Firebase token verification failed", {
        code: (error as { code?: string }).code ?? "unknown",
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      });
    }
    return null;
  }
}
