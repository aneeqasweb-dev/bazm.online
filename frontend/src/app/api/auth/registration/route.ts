import { customerRegistrationInputSchema } from "@bazm/domain";
import { FieldValue } from "firebase-admin/firestore";

import {
  synchronizeAuthorizationForUid,
  verifyBearerToken,
} from "@/lib/auth/server-claims";
import { getServerAuth, getServerFirestore } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const identity = await verifyBearerToken(request);
  if (!identity?.email) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  const parsed = customerRegistrationInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json({ error: "Enter a valid name." }, { status: 400 });
  }

  const profileReference = getServerFirestore()
    .collection("users")
    .doc(identity.uid);
  const profile = await profileReference.get();
  if (!profile.exists) {
    await profileReference.create({
      name: parsed.data.name,
      email: identity.email,
      phone: null,
      avatarUrl: null,
      avatarPath: null,
      role: "CUSTOMER",
      isActive: true,
      emailVerified: identity.email_verified === true,
      schemaVersion: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await getServerAuth().updateUser(identity.uid, {
    displayName: parsed.data.name,
  });
  return Response.json(await synchronizeAuthorizationForUid(identity.uid));
}
