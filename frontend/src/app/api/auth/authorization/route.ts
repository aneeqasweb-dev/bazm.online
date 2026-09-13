import {
  AuthorizationSyncError,
  synchronizeAuthorizationForUid,
  verifyBearerToken,
} from "@/lib/auth/server-claims";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const identity = await verifyBearerToken(request);
  if (!identity) {
    return Response.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }
  try {
    return Response.json(await synchronizeAuthorizationForUid(identity.uid));
  } catch (error) {
    if (error instanceof AuthorizationSyncError) {
      const status = error.code === "DISABLED" ? 403 : 409;
      return Response.json({ error: error.code }, { status });
    }
    return Response.json(
      { error: "Authorization could not be synchronized." },
      { status: 500 },
    );
  }
}
