"use client";

import { uploadMedia } from "@/lib/media/client";
import { MEDIA_LIMITS, validateMediaFile } from "@/lib/media/policy";

export const maxProductImageBytes = MEDIA_LIMITS.product;

export async function uploadProductMedia(file: File, alt: string) {
  const validationError = validateMediaFile(file, "product");
  if (validationError) throw new Error(validationError);
  if (alt.trim().length < 3)
    throw new Error("Provide descriptive image alt text.");
  const uploaded = await uploadMedia(file, "product");
  return {
    path: uploaded.path,
    url: uploaded.url,
    alt: alt.trim(),
    width: uploaded.width,
    height: uploaded.height,
    contentType: uploaded.contentType,
    contentHash: uploaded.contentHash,
    sortOrder: 0,
  };
}
