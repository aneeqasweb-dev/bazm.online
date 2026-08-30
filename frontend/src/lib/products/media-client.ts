"use client";

import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { getFirebaseClientServices } from "@/lib/firebase/client";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
export const maxProductImageBytes = 5 * 1024 * 1024;

export async function uploadProductMedia(file: File, alt: string) {
  if (!allowedTypes.has(file.type))
    throw new Error("Choose a JPEG, PNG, or WebP image.");
  if (file.size >= maxProductImageBytes)
    throw new Error("Choose an image smaller than 5 MB.");
  if (alt.trim().length < 3)
    throw new Error("Provide descriptive image alt text.");
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  const contentHash = Array.from(new Uint8Array(hashBuffer), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const imageUrl = URL.createObjectURL(file);
  const dimensions = await new Promise<{ width: number; height: number }>(
    (resolve, reject) => {
      const image = new Image();
      image.onload = () =>
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () =>
        reject(new Error("The selected image could not be read."));
      image.src = imageUrl;
    },
  ).finally(() => URL.revokeObjectURL(imageUrl));
  const extension = file.type.split("/")[1];
  const path = `products/${crypto.randomUUID()}/${contentHash}.${extension}`;
  const { storage } = getFirebaseClientServices();
  const storageReference = ref(storage, path);
  await uploadBytes(storageReference, file, { contentType: file.type });
  return {
    path,
    url: await getDownloadURL(storageReference),
    alt: alt.trim(),
    ...dimensions,
    contentType: file.type as "image/jpeg" | "image/png" | "image/webp",
    contentHash,
    sortOrder: 0,
  };
}
