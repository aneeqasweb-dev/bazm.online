import { customerProfileUpdateInputSchema } from "@bazm/domain";
import { FieldValue } from "firebase-admin/firestore";

import { getAuthorizedSession } from "@/lib/auth/server-session";
import { getCloudinary } from "@/lib/cloudinary/server";
import { getServerAuth, getServerFirestore } from "@/lib/firebase/admin";

export const runtime = "nodejs";

function isTrustedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const requestOrigin = new URL(request.url).origin;
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin
    : null;
  return origin === requestOrigin || origin === configuredOrigin;
}

function ownedCloudinaryAvatar(uid: string, path: string | null) {
  return path === null || path === `bazm/avatars/${uid}/profile`;
}

export async function PATCH(request: Request) {
  if (!isTrustedOrigin(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const session = await getAuthorizedSession({ requireVerified: true });
  if (!session.claims || session.reason) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  const parsed = customerProfileUpdateInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "Enter valid profile details." },
      { status: 400 },
    );
  }
  if (!ownedCloudinaryAvatar(session.claims.uid, parsed.data.avatarPath)) {
    return Response.json(
      { error: "The avatar path is invalid." },
      { status: 400 },
    );
  }

  const profileReference = getServerFirestore()
    .collection("users")
    .doc(session.claims.uid);
  const profile = await profileReference.get();
  if (!profile.exists || profile.get("isActive") !== true) {
    return Response.json(
      { error: "The account is unavailable." },
      { status: 403 },
    );
  }

  const previousAvatarPath = profile.get("avatarPath");
  const avatarUrl = parsed.data.avatarPath
    ? getCloudinary().url(parsed.data.avatarPath, {
        fetch_format: "auto",
        quality: "auto",
        secure: true,
        transformation: [
          { crop: "fill", gravity: "face", height: 256, width: 256 },
        ],
      })
    : null;

  await Promise.all([
    profileReference.update({
      name: parsed.data.name,
      phone: parsed.data.phone,
      avatarPath: parsed.data.avatarPath,
      avatarUrl,
      updatedAt: FieldValue.serverTimestamp(),
    }),
    getServerAuth().updateUser(session.claims.uid, {
      displayName: parsed.data.name,
      photoURL: avatarUrl,
    }),
  ]);

  if (
    parsed.data.avatarPath === null &&
    typeof previousAvatarPath === "string" &&
    previousAvatarPath.startsWith(`bazm/avatars/${session.claims.uid}/`)
  ) {
    await getCloudinary()
      .uploader.destroy(previousAvatarPath, {
        invalidate: true,
        resource_type: "image",
      })
      .catch(() => undefined);
  }

  return Response.json({
    avatarPath: parsed.data.avatarPath,
    avatarUrl,
    ok: true,
  });
}
