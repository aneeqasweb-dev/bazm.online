"use client";

import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import {
  getDownloadURL,
  ref,
  uploadBytes,
  type FirebaseStorage,
} from "firebase/storage";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";

import { getFirebaseClientServices } from "@/lib/firebase/client";

type ReviewImage = {
  path: string;
  url: string;
  alt: string;
  width: number;
  height: number;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  contentHash: string;
  sortOrder: number;
};

type ReviewItem = {
  orderId: string;
  productId: string;
  variantId: string;
  productName: string;
  sku: string;
  color: string;
  size: string;
  quantity: number;
  placedAt: string;
  existingReview: {
    id: string;
    status: string;
    rating: number;
    title: string | null;
    content: string;
    images: ReviewImage[];
    createdAt: string;
    editableUntil: string;
    canEdit: boolean;
  } | null;
};

function errorMessage(error: unknown) {
  return error instanceof FirebaseError
    ? error.message.replace(/^.*?:\s*/, "")
    : error instanceof Error
      ? error.message
      : "The review could not be saved.";
}

function safeFileName(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "review-image.webp"
  );
}

async function imageDimensions(file: File) {
  const url = URL.createObjectURL(file);
  return new Promise<{ width: number; height: number }>((resolve) => {
    const image = new window.Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: Math.max(1, image.naturalWidth),
        height: Math.max(1, image.naturalHeight),
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 1, height: 1 });
    };
    image.src = url;
  });
}

async function uploadReviewImages({
  files,
  productName,
  storage,
  userId,
}: {
  files: File[];
  productName: string;
  storage: FirebaseStorage;
  userId: string;
}) {
  if (files.length > 5) {
    throw new Error("Upload at most 5 review images.");
  }
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  const uploaded: ReviewImage[] = [];
  for (const [index, file] of files.entries()) {
    if (!allowedTypes.has(file.type)) {
      throw new Error("Review images must be JPEG, PNG, or WebP.");
    }
    if (file.size >= 3 * 1024 * 1024) {
      throw new Error("Each review image must be below 3 MB.");
    }
    const path = `reviews/${userId}/${Date.now()}-${index}-${safeFileName(
      file.name,
    )}`;
    const imageRef = ref(storage, path);
    const [{ width, height }] = await Promise.all([
      imageDimensions(file),
      uploadBytes(imageRef, file, { contentType: file.type }),
    ]);
    uploaded.push({
      path,
      url: await getDownloadURL(imageRef),
      alt: `Review image for ${productName}`.slice(0, 180),
      width,
      height,
      contentType: file.type as ReviewImage["contentType"],
      contentHash: `review-image-${file.lastModified}-${file.size}-${index}`,
      sortOrder: index,
    });
  }
  return uploaded;
}

function statusLabel(status: string) {
  return status.toLowerCase().replaceAll("_", " ");
}

function ReviewForm({ item }: { item: ReviewItem }) {
  const router = useRouter();
  const existing = item.existingReview;
  const [message, setMessage] = useState<string>();
  const [pending, setPending] = useState(false);
  const canSubmit = !existing || existing.canEdit;
  const fieldPrefix = `${item.orderId}-${item.variantId}`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setMessage(undefined);
    try {
      const form = new FormData(event.currentTarget);
      const { auth, functions, storage } = getFirebaseClientServices();
      const user = auth.currentUser;
      if (!user) throw new Error("Sign in again before saving a review.");
      const files = form.getAll("images").filter((file): file is File => {
        return file instanceof File && file.size > 0;
      });
      const uploadedImages = files.length
        ? await uploadReviewImages({
            files,
            productName: item.productName,
            storage,
            userId: user.uid,
          })
        : undefined;
      const reviewInput = {
        rating: Number(form.get("rating")),
        title: String(form.get("title") ?? "").trim() || null,
        content: String(form.get("content") ?? ""),
        ...(uploadedImages ? { images: uploadedImages } : {}),
      };

      if (existing) {
        await httpsCallable(
          functions,
          "updateReview",
        )({
          reviewId: existing.id,
          input: reviewInput,
        });
        setMessage("Review updated and sent back to moderation.");
      } else {
        await httpsCallable(
          functions,
          "createReview",
        )({
          orderId: item.orderId,
          productId: item.productId,
          variantId: item.variantId,
          images: [],
          ...reviewInput,
        });
        setMessage("Review submitted for moderation.");
        event.currentTarget.reset();
      }
      router.refresh();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="rounded-2xl border border-stone-800 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{item.productName}</h3>
          <p className="mt-1 text-xs text-stone-500">
            {item.color} / {item.size} · {item.sku} · order{" "}
            {item.orderId.slice(-8).toUpperCase()}
          </p>
        </div>
        {existing ? (
          <span className="rounded-full bg-stone-800 px-3 py-1 text-xs text-amber-200 capitalize">
            {statusLabel(existing.status)}
          </span>
        ) : (
          <span className="rounded-full bg-stone-800 px-3 py-1 text-xs text-emerald-200">
            Eligible
          </span>
        )}
      </div>
      {existing?.images.length ? (
        <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
          {existing.images.map((image) => (
            <div
              className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-stone-800 bg-stone-950"
              key={image.path}
            >
              <Image
                alt={image.alt}
                className="object-cover"
                fill
                quality={60}
                sizes="80px"
                src={image.url}
              />
            </div>
          ))}
        </div>
      ) : null}
      {existing && !existing.canEdit ? (
        <p className="mt-4 text-sm text-stone-400">
          This review can no longer be edited. The edit window ended on{" "}
          {new Date(existing.editableUntil).toLocaleDateString("en-PK")}.
        </p>
      ) : (
        <form className="mt-4 grid gap-3" onSubmit={submit}>
          <label
            className="text-sm text-stone-300"
            htmlFor={`${fieldPrefix}-rating`}
          >
            Rating
            <select
              className="field"
              defaultValue={existing?.rating ?? 5}
              id={`${fieldPrefix}-rating`}
              name="rating"
              required
            >
              {[5, 4, 3, 2, 1].map((rating) => (
                <option key={rating} value={rating}>
                  {rating} star{rating === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
          <input
            className="field"
            defaultValue={existing?.title ?? ""}
            maxLength={120}
            minLength={3}
            name="title"
            placeholder="Review title (optional)"
          />
          <textarea
            className="field min-h-28"
            defaultValue={existing?.content ?? ""}
            maxLength={2000}
            minLength={10}
            name="content"
            placeholder="Share fit, quality, fabric, delivery…"
            required
          />
          <label
            className="text-sm text-stone-300"
            htmlFor={`${fieldPrefix}-images`}
          >
            Optional images
            <input
              accept="image/jpeg,image/png,image/webp"
              className="field"
              id={`${fieldPrefix}-images`}
              multiple
              name="images"
              type="file"
            />
          </label>
          <button
            className="rounded-full bg-amber-300 px-5 py-3 font-semibold text-stone-950 disabled:opacity-60"
            disabled={pending}
            type="submit"
          >
            {pending ? "Saving…" : existing ? "Update review" : "Submit review"}
          </button>
        </form>
      )}
      {message ? (
        <p aria-live="polite" className="mt-3 text-sm text-stone-400">
          {message}
        </p>
      ) : null}
    </article>
  );
}

export function ReviewCenter({ items }: { items: ReviewItem[] }) {
  return (
    <section className="mt-10 border-t border-stone-800 pt-8">
      <p className="text-sm tracking-[0.2em] text-amber-300 uppercase">
        Verified reviews
      </p>
      <h2 className="mt-2 text-2xl font-semibold">Review delivered items</h2>
      <p className="mt-2 text-sm text-stone-400">
        Delivered purchases can receive one review. New reviews and edits stay
        pending until a moderator publishes them.
      </p>
      {items.length ? (
        <div className="mt-5 grid gap-4">
          {items.map((item) => (
            <ReviewForm
              item={item}
              key={`${item.orderId}-${item.productId}-${item.variantId}`}
            />
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-stone-400">
          Delivered items eligible for review will appear here.
        </p>
      )}
    </section>
  );
}
