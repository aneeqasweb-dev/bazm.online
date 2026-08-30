import { DomainError, emailSchema, userDocumentSchema } from "@bazm/domain";
import { logger } from "firebase-functions";
import { defineSecret } from "firebase-functions/params";
import {
  HttpsError,
  onCall,
  type CallableRequest,
  type FunctionsErrorCode,
} from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  onDocumentCreated,
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";
import { z } from "zod";

import {
  requireActiveUser,
  requireAdminPermission,
} from "../auth/admin-permissions.js";
import { getAdminAuth, getAdminFirestore } from "../lib/firebase-admin.js";
import { appActionLink, appLink, EmailService } from "./email-service.js";

const emailProviderApiKey = defineSecret("EMAIL_PROVIDER_API_KEY");
const options = {
  region: "asia-south1",
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true",
  secrets: [emailProviderApiKey],
};
const scheduledOptions = {
  region: "asia-south1",
  secrets: [emailProviderApiKey],
};

const resetEmailRequestSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

function service() {
  return new EmailService(getAdminFirestore());
}

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

async function requireEmailAdmin(request: CallableRequest<unknown>) {
  return requireAdminPermission(request, "email.manage");
}

function hourScope() {
  return new Date().toISOString().slice(0, 13).replaceAll("-", "");
}

async function userIdentity(uid: string) {
  const [authUser, profileSnapshot] = await Promise.all([
    getAdminAuth().getUser(uid),
    getAdminFirestore().collection("users").doc(uid).get(),
  ]);
  const profile = profileSnapshot.exists
    ? userDocumentSchema.parse(profileSnapshot.data())
    : null;
  const email = authUser.email ?? profile?.email;
  if (!email) {
    throw new DomainError("PRECONDITION_FAILED", "The account has no email.");
  }
  return {
    email,
    name: profile?.name ?? authUser.displayName ?? "Bazm customer",
    emailVerified: authUser.emailVerified,
  };
}

export const sendVerificationEmail = onCall(options, async (request) => {
  const uid = await requireActiveUser(request);
  try {
    const user = await userIdentity(uid);
    if (user.emailVerified) {
      return { ok: true as const, skipped: true as const };
    }
    const firebaseLink = await getAdminAuth().generateEmailVerificationLink(
      user.email,
      { url: appLink("/verify-email") },
    );
    const delivery = await service().sendEmailVerification(
      uid,
      user,
      appActionLink(firebaseLink, "/verify-email"),
      `request:${hourScope()}`,
    );
    return { ok: true as const, skipped: false as const, delivery };
  } catch (error) {
    return toHttpsError(error);
  }
});

export const requestPasswordResetEmail = onCall(options, async (request) => {
  const input = resetEmailRequestSchema.safeParse(request.data);
  if (!input.success) {
    throw new HttpsError("invalid-argument", "Enter a valid email address.");
  }
  try {
    const authUser = await getAdminAuth()
      .getUserByEmail(input.data.email)
      .catch((error: unknown) => {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "auth/user-not-found"
        ) {
          return null;
        }
        throw error;
      });
    if (!authUser?.email) {
      return { ok: true as const, accepted: true as const };
    }
    const profileSnapshot = await getAdminFirestore()
      .collection("users")
      .doc(authUser.uid)
      .get();
    const profile = profileSnapshot.exists
      ? userDocumentSchema.parse(profileSnapshot.data())
      : null;
    const user = {
      email: authUser.email,
      name: profile?.name ?? authUser.displayName ?? "Bazm customer",
    };
    const firebaseLink = await getAdminAuth().generatePasswordResetLink(
      authUser.email,
      { url: appLink("/login?reset=complete") },
    );
    const delivery = await service().sendPasswordReset(
      authUser.uid,
      user,
      appActionLink(firebaseLink, "/reset-password"),
      `request:${hourScope()}`,
    );
    return { ok: true as const, accepted: true as const, delivery };
  } catch (error) {
    return toHttpsError(error);
  }
});

export const retryEmailDeliveries = onCall(options, async (request) => {
  await requireEmailAdmin(request);
  try {
    return {
      ok: true as const,
      ...(await service().retryPending({ includeFuture: true })),
    };
  } catch (error) {
    return toHttpsError(error);
  }
});

export const retryEmailDeliveriesScheduled = onSchedule(
  { ...scheduledOptions, schedule: "every 15 minutes" },
  async () => {
    const result = await service().retryPending();
    logger.info("email.retry.completed", {
      attempted: result.attempted.length,
      structuredData: true,
    });
  },
);

export const sendReturnRequestedEmail = onDocumentCreated(
  {
    ...scheduledOptions,
    document: "returns/{returnId}",
  },
  async (event) => {
    if (!event.data) return;
    await service().sendReturnRequested(event.params.returnId);
  },
);

export const sendReturnUpdatedEmail = onDocumentUpdated(
  {
    ...scheduledOptions,
    document: "returns/{returnId}",
  },
  async (event) => {
    const before = event.data?.before.get("status");
    const after = event.data?.after.get("status");
    if (!after || before === after) return;
    await service().sendReturnUpdated(event.params.returnId);
  },
);
