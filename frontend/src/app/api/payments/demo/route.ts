import { DomainError } from "@bazm/domain";
import {
  DemoPaymentService,
  demoPaymentRequestSchema,
} from "@bazm/functions/demo-payments";

import { getAuthorizedSession } from "@/lib/auth/server-session";
import { getServerFirestore } from "@/lib/firebase/admin";
import { isTrustedOrigin } from "@/lib/http/trusted-origin";

export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  if (!isTrustedOrigin(request))
    return json({ error: "Invalid request origin." }, 403);
  const session = await getAuthorizedSession({ requireVerified: true });
  if (!session.claims || session.reason)
    return json(
      { error: "Sign in with a verified account to continue." },
      session.claims ? 403 : 401,
    );
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return json({ error: "Send a JSON payment request." }, 415);
  const parsed = demoPaymentRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return json(
      { error: "Enter valid checkout details. Do not send card information." },
      400,
    );

  let orderId: string | undefined;
  try {
    const service = new DemoPaymentService(getServerFirestore());
    orderId =
      "orderId" in parsed.data
        ? parsed.data.orderId
        : (await service.createOrder(session.claims.uid, parsed.data)).orderId;
    const payment = await service.complete(session.claims.uid, orderId);
    return json({
      ok: true,
      payment,
      confirmationUrl: `/checkout/confirmation/${payment.orderId}`,
    });
  } catch (error) {
    const status =
      error instanceof DomainError
        ? (
            {
              NOT_FOUND: 404,
              FORBIDDEN: 403,
              UNAUTHENTICATED: 401,
              CONFLICT: 409,
              PRECONDITION_FAILED: 409,
              INVALID_ARGUMENT: 400,
              RATE_LIMITED: 429,
              UNAVAILABLE: 503,
              INTERNAL: 500,
            } as const
          )[error.code]
        : 500;
    return json(
      {
        error:
          error instanceof DomainError
            ? error.message
            : "Demo payment could not be completed. Please try again.",
        ...(orderId && status !== 403 && status !== 404 ? { orderId } : {}),
      },
      status,
    );
  }
}
