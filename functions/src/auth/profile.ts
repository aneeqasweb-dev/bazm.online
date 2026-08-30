import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { customerProfileUpdateInputSchema } from "@bazm/domain";

import { requireActiveUser } from "./admin-permissions.js";
import { getAdminAuth, getAdminFirestore } from "../lib/firebase-admin.js";

export const profileUpdateSchema = customerProfileUpdateInputSchema;

export function isOwnedAvatarPath(uid: string, path: string | null) {
  return path === null || path === `avatars/${uid}/profile`;
}

export const updateMyProfile = onCall(
  {
    region: "asia-south1",
    enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true",
  },
  async (request) => {
    const uid = await requireActiveUser(request);

    const parsed = profileUpdateSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", "Enter valid profile details.");
    }

    if (!isOwnedAvatarPath(uid, parsed.data.avatarPath)) {
      throw new HttpsError("invalid-argument", "The avatar path is invalid.");
    }

    const profileReference = getAdminFirestore().collection("users").doc(uid);
    const profile = await profileReference.get();

    if (!profile.exists) {
      throw new HttpsError(
        "failed-precondition",
        "The account profile is missing.",
      );
    }
    if (profile.get("isActive") !== true) {
      throw new HttpsError("permission-denied", "This account is disabled.");
    }

    await Promise.all([
      profileReference.update({
        name: parsed.data.name,
        phone: parsed.data.phone,
        avatarPath: parsed.data.avatarPath,
        updatedAt: FieldValue.serverTimestamp(),
      }),
      getAdminAuth().updateUser(uid, {
        displayName: parsed.data.name,
      }),
    ]);

    return { ok: true as const };
  },
);
