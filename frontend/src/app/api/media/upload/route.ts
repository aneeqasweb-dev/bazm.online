import { createHash, randomUUID } from "node:crypto";

import { canUseAdminModule } from "@/lib/admin/permissions";
import { getAuthorizedSession } from "@/lib/auth/server-session";
import { getCloudinary } from "@/lib/cloudinary/server";
import {
  hasValidImageSignature,
  mediaPurposeSchema,
  validateMediaFile,
  type MediaPurpose,
} from "@/lib/media/policy";

export const runtime = "nodejs";

function trustedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const requestUrl = new URL(request.url);
  const configured = process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin
    : null;
  return origin === requestUrl.origin || origin === configured;
}

function authorizedForPurpose(
  claims: Record<string, unknown>,
  purpose: MediaPurpose,
) {
  return (
    !["category", "product"].includes(purpose) ||
    canUseAdminModule(claims, "catalog.manage")
  );
}

function uploadIdentity(purpose: MediaPurpose, uid: string) {
  if (purpose === "avatar") {
    return { folder: `bazm/avatars/${uid}`, publicId: "profile" };
  }
  const collection = purpose === "category" ? "categories" : `${purpose}s`;
  return {
    folder: `bazm/${collection}/${purpose === "review" ? uid : "catalog"}`,
    publicId: randomUUID(),
  };
}

export async function POST(request: Request) {
  if (!trustedOrigin(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const session = await getAuthorizedSession({ requireVerified: true });
  if (!session.claims || session.reason) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const form = await request.formData().catch(() => null);
  const purposeResult = mediaPurposeSchema.safeParse(form?.get("purpose"));
  const file = form?.get("file");
  if (!purposeResult.success || !(file instanceof File)) {
    return Response.json({ error: "Invalid media request." }, { status: 400 });
  }

  const purpose = purposeResult.data;
  if (!authorizedForPurpose(session.claims, purpose)) {
    return Response.json(
      { error: "Media upload is not allowed." },
      { status: 403 },
    );
  }

  const validationError = validateMediaFile(file, purpose);
  if (validationError) {
    return Response.json({ error: validationError }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!hasValidImageSignature(buffer, file.type)) {
    return Response.json(
      { error: "The file is not a valid image." },
      { status: 400 },
    );
  }

  const { folder, publicId } = uploadIdentity(purpose, session.claims.uid);
  const result = await getCloudinary()
    .uploader.upload(`data:${file.type};base64,${buffer.toString("base64")}`, {
      allowed_formats: ["jpg", "jpeg", "png", "webp"],
      folder,
      invalidate: purpose === "avatar",
      overwrite: purpose === "avatar",
      public_id: publicId,
      resource_type: "image",
      unique_filename: false,
      use_filename: false,
    })
    .catch(() => null);

  if (!result) {
    return Response.json(
      { error: "Image upload is temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }

  return Response.json({
    asset: {
      contentHash: createHash("sha256").update(buffer).digest("hex"),
      contentType: file.type,
      height: result.height,
      path: result.public_id,
      provider: "cloudinary",
      size: result.bytes,
      url: result.secure_url,
      width: result.width,
    },
  });
}
