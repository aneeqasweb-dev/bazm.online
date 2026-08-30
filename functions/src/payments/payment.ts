import {
  DomainError,
  paymentWebhookEventSchema,
  refundInputSchema,
} from "@bazm/domain";
import { createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import {
  HttpsError,
  onCall,
  onRequest,
  type FunctionsErrorCode,
} from "firebase-functions/v2/https";
import { z } from "zod";

import {
  requireActiveUser,
  requireAdminPermission,
} from "../auth/admin-permissions.js";
import { getAdminFirestore } from "../lib/firebase-admin.js";
import {
  PaymentService,
  paymentIntentCommandSchema,
} from "./payment-service.js";

const options = {
  region: "asia-south1",
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true",
};
const paymentWebhookSecret = defineSecret("PAYMENT_WEBHOOK_SECRET");
const webhookOptions = {
  maxInstances: 10,
  region: "asia-south1",
  secrets: [paymentWebhookSecret],
};
const service = () => new PaymentService(getAdminFirestore());

const refundWebhookSchema = z
  .object({
    eventId: z.string().trim().min(8).max(255),
    refundId: z.string().trim().min(1).max(255),
    status: z.enum(["SUCCEEDED", "FAILED"]),
  })
  .strict();

function toHttpsError(error: unknown): never {
  if (error instanceof DomainError) {
    const codes: Record<DomainError["code"], FunctionsErrorCode> = {
      INVALID_ARGUMENT: "invalid-argument",
      NOT_FOUND: "not-found",
      CONFLICT: "already-exists",
      PRECONDITION_FAILED: "failed-precondition",
      FORBIDDEN: "permission-denied",
      UNAUTHENTICATED: "unauthenticated",
      RATE_LIMITED: "resource-exhausted",
      UNAVAILABLE: "unavailable",
      INTERNAL: "internal",
    };
    throw new HttpsError(codes[error.code], error.message);
  }
  throw error;
}

function webhookSecret() {
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    return process.env.PAYMENT_WEBHOOK_SECRET ?? "emulator-payment-secret";
  }
  const configured = paymentWebhookSecret.value().trim();
  if (configured) return configured;
  throw new DomainError("UNAVAILABLE", "Payment webhook is not configured.");
}

function hasValidSignature(rawBody: Buffer, supplied: string | undefined) {
  if (!supplied) return false;
  const expected = createHmac("sha256", webhookSecret())
    .update(rawBody)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const suppliedBuffer = Buffer.from(supplied, "hex");
  return (
    suppliedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}

function rawJson(request: { rawBody?: Buffer; body?: unknown }) {
  if (!request.rawBody)
    throw new DomainError(
      "INVALID_ARGUMENT",
      "A raw webhook body is required.",
    );
  return {
    rawBody: request.rawBody,
    payload: JSON.parse(request.rawBody.toString("utf8")) as unknown,
  };
}

function webhookError(
  response: { status: (code: number) => { json: (value: unknown) => void } },
  error: unknown,
) {
  const status =
    error instanceof DomainError && error.code === "UNAVAILABLE" ? 503 : 400;
  response.status(status).json({ ok: false, error: "invalid_webhook" });
}

function logWebhookSecurityFailure(
  webhook: "payment" | "refund",
  reason: "invalid_method" | "invalid_payload" | "invalid_signature",
) {
  logger.warn("security.webhook.rejected", {
    reason,
    structuredData: true,
    webhook,
  });
}

export const createPaymentAttempt = onCall(options, async (request) => {
  const uid = await requireActiveUser(request);
  const input = paymentIntentCommandSchema.safeParse(request.data);
  if (!input.success)
    throw new HttpsError("invalid-argument", "Select a valid order.");
  try {
    return {
      ok: true as const,
      ...(await service().createAttempt(uid, input.data.orderId)),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});

export const initiateRefund = onCall(options, async (request) => {
  const actorId = await requireAdminPermission(request, "payments.manage");
  const input = refundInputSchema.safeParse(request.data);
  if (!input.success)
    throw new HttpsError("invalid-argument", "Enter complete refund details.");
  try {
    return {
      ok: true as const,
      ...(await service().initiateRefund(actorId, input.data)),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});

export const paymentWebhook = onRequest(
  webhookOptions,
  async (request, response) => {
    try {
      if (request.method !== "POST") {
        logWebhookSecurityFailure("payment", "invalid_method");
        response.status(405).json({ ok: false });
        return;
      }
      const { rawBody, payload } = rawJson(request);
      if (
        !hasValidSignature(
          rawBody,
          request.get("x-bazm-signature") ?? undefined,
        )
      ) {
        logWebhookSecurityFailure("payment", "invalid_signature");
        response.status(401).json({ ok: false, error: "invalid_signature" });
        return;
      }
      const event = paymentWebhookEventSchema.safeParse(payload);
      if (!event.success) {
        logWebhookSecurityFailure("payment", "invalid_payload");
        response.status(400).json({ ok: false, error: "invalid_payload" });
        return;
      }
      response.status(200).json(await service().processWebhook(event.data));
    } catch (error) {
      webhookError(response, error);
    }
  },
);

export const refundWebhook = onRequest(
  webhookOptions,
  async (request, response) => {
    try {
      if (request.method !== "POST") {
        logWebhookSecurityFailure("refund", "invalid_method");
        response.status(405).json({ ok: false });
        return;
      }
      const { rawBody, payload } = rawJson(request);
      if (
        !hasValidSignature(
          rawBody,
          request.get("x-bazm-signature") ?? undefined,
        )
      ) {
        logWebhookSecurityFailure("refund", "invalid_signature");
        response.status(401).json({ ok: false, error: "invalid_signature" });
        return;
      }
      const event = refundWebhookSchema.safeParse(payload);
      if (!event.success) {
        logWebhookSecurityFailure("refund", "invalid_payload");
        response.status(400).json({ ok: false, error: "invalid_payload" });
        return;
      }
      response
        .status(200)
        .json(
          await service().completeRefund(
            event.data.refundId,
            event.data.status === "SUCCEEDED",
            event.data.eventId,
          ),
        );
    } catch (error) {
      webhookError(response, error);
    }
  },
);
