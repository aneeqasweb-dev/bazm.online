import { z } from "zod";

import { CURRENT_CLAIMS_VERSION } from "@/lib/auth/server-authorization";
import { SESSION_COOKIE_NAME } from "@/lib/auth/server-session";
import { getServerAuth } from "@/lib/firebase/admin";

const sessionRequestSchema = z
  .object({ idToken: z.string().min(100) })
  .strict();
const FIVE_DAYS_IN_SECONDS = 60 * 60 * 24 * 5;
const usesSecureCookies =
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== "true";

function sessionCookieAttributes(maxAge: number) {
  return [
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
    "Priority=High",
    usesSecureCookies ? "Secure" : null,
  ]
    .filter(Boolean)
    .join("; ");
}

function isTrustedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin === null) return true;

  const requestUrl = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol =
    request.headers.get("x-forwarded-proto") ??
    requestUrl.protocol.replace(":", "");
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin
    : null;
  const hostOrigin = host ? `${protocol}://${host}` : null;

  return [requestUrl.origin, hostOrigin, configuredOrigin].includes(origin);
}

export async function POST(request: Request) {
  if (!isTrustedOrigin(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const parsed = sessionRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid session request." },
      { status: 400 },
    );
  }

  try {
    const auth = getServerAuth();
    const claims = await auth.verifyIdToken(parsed.data.idToken, true);
    const nowSeconds = Date.now() / 1000;
    if (nowSeconds - claims.auth_time > 5 * 60) {
      return Response.json(
        { error: "Recent sign-in required." },
        { status: 401 },
      );
    }
    if (claims.isActive !== true) {
      return Response.json({ error: "Account is disabled." }, { status: 403 });
    }
    if (claims.claimsVersion !== CURRENT_CLAIMS_VERSION) {
      return Response.json(
        { error: "Refresh your session and try again." },
        { status: 403 },
      );
    }

    const sessionCookie = await auth.createSessionCookie(parsed.data.idToken, {
      expiresIn: FIVE_DAYS_IN_SECONDS * 1000,
    });
    const response = Response.json({ ok: true });
    response.headers.append(
      "Set-Cookie",
      `${SESSION_COOKIE_NAME}=${sessionCookie}; ${sessionCookieAttributes(
        FIVE_DAYS_IN_SECONDS,
      )}`,
    );
    return response;
  } catch {
    return Response.json({ error: "Authentication failed." }, { status: 401 });
  }
}

export function DELETE(request: Request) {
  if (!isTrustedOrigin(request)) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const response = Response.json({ ok: true });
  response.headers.append(
    "Set-Cookie",
    `${SESSION_COOKIE_NAME}=; ${sessionCookieAttributes(0)}`,
  );
  return response;
}
