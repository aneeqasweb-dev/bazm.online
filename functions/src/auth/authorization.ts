import {
  adminPermissionSchema,
  userRoleSchema,
  type UserRole,
} from "@bazm/domain";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { z } from "zod";

import { getAdminAuth, getAdminFirestore } from "../lib/firebase-admin.js";

export { userRoleSchema };
export type { UserRole };

const trustedProfileSchema = z.object({
  role: userRoleSchema,
  isActive: z.boolean(),
  permissions: z.array(adminPermissionSchema).max(50).optional(),
});

export async function synchronizeAuthorizationForUid(uid: string) {
  const profileReference = getAdminFirestore().collection("users").doc(uid);
  const [profileSnapshot, authUser] = await Promise.all([
    profileReference.get(),
    getAdminAuth().getUser(uid),
  ]);

  if (!profileSnapshot.exists) {
    throw new HttpsError(
      "failed-precondition",
      "The account profile is missing.",
    );
  }

  const parsedProfile = trustedProfileSchema.safeParse(profileSnapshot.data());
  if (!parsedProfile.success) {
    throw new HttpsError("internal", "The account profile is invalid.");
  }

  const active = parsedProfile.data.isActive && !authUser.disabled;
  const claims: Record<string, unknown> = {
    role: parsedProfile.data.role,
    isActive: active,
    claimsVersion: 1,
  };

  if (
    parsedProfile.data.role === "STAFF" &&
    parsedProfile.data.permissions?.length
  ) {
    claims.permissions = parsedProfile.data.permissions;
  }

  await getAdminAuth().setCustomUserClaims(uid, claims);
  await profileReference.update({
    emailVerified: authUser.emailVerified,
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (!active) {
    await getAdminAuth().revokeRefreshTokens(uid);
    throw new HttpsError(
      "permission-denied",
      "This account is disabled. Contact support for help.",
    );
  }

  return {
    ok: true as const,
    role: parsedProfile.data.role,
    emailVerified: authUser.emailVerified,
  };
}

export const synchronizeAuthorization = onCall(
  {
    region: "asia-south1",
    enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true",
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    return synchronizeAuthorizationForUid(request.auth.uid);
  },
);
