import { z } from "zod";

export const mediaPurposeSchema = z.enum([
  "avatar",
  "category",
  "product",
  "review",
]);
export type MediaPurpose = z.infer<typeof mediaPurposeSchema>;

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const allowedImageTypes = new Set<string>(ALLOWED_IMAGE_TYPES);

export const MEDIA_LIMITS: Record<MediaPurpose, number> = {
  avatar: 4 * 1024 * 1024,
  category: 4 * 1024 * 1024,
  product: 4 * 1024 * 1024,
  review: 3 * 1024 * 1024,
};

export function validateMediaFile(
  file: Pick<File, "size" | "type">,
  purpose: MediaPurpose,
) {
  if (!allowedImageTypes.has(file.type)) {
    return "Choose a JPEG, PNG, or WebP image.";
  }
  if (file.size === 0 || file.size > MEDIA_LIMITS[purpose]) {
    const megabytes = MEDIA_LIMITS[purpose] / (1024 * 1024);
    return `Choose an image no larger than ${megabytes} MB.`;
  }
  return null;
}

export function hasValidImageSignature(bytes: Uint8Array, contentType: string) {
  if (contentType === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    );
  }
  if (contentType === "image/webp") {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  return false;
}
