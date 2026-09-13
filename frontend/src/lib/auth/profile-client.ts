"use client";

import { MEDIA_LIMITS, validateMediaFile } from "@/lib/media/policy";
import { uploadMedia } from "@/lib/media/client";

import type { ProfileInput } from "./auth-schema";

export const MAX_AVATAR_BYTES = MEDIA_LIMITS.avatar;

export function validateAvatar(file: File) {
  return validateMediaFile(file, "avatar");
}

export async function updateProfile(
  input: ProfileInput & {
    avatar?: File;
    currentAvatarPath: string | null;
    removeAvatar: boolean;
  },
) {
  let avatarPath = input.removeAvatar ? null : input.currentAvatarPath;

  if (input.avatar) {
    const avatarError = validateAvatar(input.avatar);
    if (avatarError) throw new Error(avatarError);
    avatarPath = (await uploadMedia(input.avatar, "avatar")).path;
  }

  const response = await fetch("/api/account/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      phone: input.phone || null,
      avatarPath,
    }),
  });
  const body = (await response.json().catch(() => null)) as {
    avatarPath?: string | null;
    error?: string;
  } | null;
  if (!response.ok) {
    throw new Error(body?.error ?? "The profile could not be saved.");
  }

  return { avatarPath: body?.avatarPath ?? null };
}
