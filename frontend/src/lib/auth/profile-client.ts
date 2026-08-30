"use client";

import { deleteObject, ref, uploadBytes } from "firebase/storage";
import { httpsCallable } from "firebase/functions";

import { getFirebaseClientServices } from "@/lib/firebase/client";

import type { ProfileInput } from "./auth-schema";

const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export function validateAvatar(file: File) {
  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    return "Choose a JPEG, PNG, or WebP image.";
  }
  if (file.size >= MAX_AVATAR_BYTES) {
    return "Choose an image smaller than 5 MB.";
  }
  return null;
}

export async function updateProfile(
  input: ProfileInput & {
    avatar?: File;
    currentAvatarPath: string | null;
    removeAvatar: boolean;
  },
) {
  const { auth, functions, storage } = getFirebaseClientServices();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw new Error("AUTHENTICATION_REQUIRED");

  let avatarPath = input.removeAvatar ? null : input.currentAvatarPath;
  const avatarReference = ref(storage, `avatars/${user.uid}/profile`);

  if (input.avatar) {
    const avatarError = validateAvatar(input.avatar);
    if (avatarError) throw new Error(avatarError);
    await uploadBytes(avatarReference, input.avatar, {
      contentType: input.avatar.type,
    });
    avatarPath = avatarReference.fullPath;
  }

  const updateMyProfile = httpsCallable<
    { name: string; phone: string | null; avatarPath: string | null },
    { ok: true }
  >(functions, "updateMyProfile");
  await updateMyProfile({
    name: input.name,
    phone: input.phone || null,
    avatarPath,
  });

  if (input.removeAvatar && input.currentAvatarPath) {
    await deleteObject(avatarReference).catch(() => undefined);
  }

  return { avatarPath };
}
