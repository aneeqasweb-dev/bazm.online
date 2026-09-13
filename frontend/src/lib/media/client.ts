"use client";

import type { MediaPurpose } from "./policy";

export type UploadedMediaAsset = {
  contentHash: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  height: number;
  path: string;
  provider: "cloudinary";
  size: number;
  url: string;
  width: number;
};

export async function uploadMedia(file: File, purpose: MediaPurpose) {
  const form = new FormData();
  form.set("purpose", purpose);
  form.set("file", file);
  const response = await fetch("/api/media/upload", {
    method: "POST",
    body: form,
  });
  const body = (await response.json().catch(() => null)) as {
    asset?: UploadedMediaAsset;
    error?: string;
  } | null;
  if (!response.ok || !body?.asset) {
    throw new Error(body?.error ?? "The image could not be uploaded.");
  }
  return body.asset;
}
