import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { customerRegistrationInputSchema } from "@bazm/domain";

import { getAdminAuth, getAdminFirestore } from "../lib/firebase-admin.js";
import {
  appActionLink,
  appLink,
  EmailService,
} from "../email/email-service.js";
import { synchronizeAuthorizationForUid } from "./authorization.js";

export const registrationProfileSchema = customerRegistrationInputSchema;

export const completeRegistration = onCall(
  {
    region: "asia-south1",
    enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true",
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    const parsed = registrationProfileSchema.safeParse(request.data);
    if (!parsed.success) {
      throw new HttpsError("invalid-argument", "Enter a valid name.");
    }

    const { uid, token } = request.auth;
    const email = typeof token.email === "string" ? token.email : null;
    if (!email) {
      throw new HttpsError("failed-precondition", "The account has no email.");
    }

    const firestore = getAdminFirestore();
    const auth = getAdminAuth();
    const userReference = firestore.collection("users").doc(uid);
    const existingProfile = await userReference.get();

    if (!existingProfile.exists) {
      await userReference.create({
        name: parsed.data.name,
        email,
        phone: null,
        avatarUrl: null,
        avatarPath: null,
        role: "CUSTOMER",
        isActive: true,
        emailVerified: token.email_verified === true,
        schemaVersion: 1,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    await auth.updateUser(uid, { displayName: parsed.data.name });
    const authorization = await synchronizeAuthorizationForUid(uid);
    const emailService = new EmailService(firestore);
    const welcome = await emailService.sendWelcome(uid, {
      email,
      name: parsed.data.name,
    });
    let verification = null;
    if (!authorization.emailVerified) {
      const firebaseLink = await auth.generateEmailVerificationLink(email, {
        url: appLink("/verify-email"),
      });
      verification = await emailService.sendEmailVerification(
        uid,
        { email, name: parsed.data.name },
        appActionLink(firebaseLink, "/verify-email"),
        "initial",
      );
    }

    return {
      ok: true,
      role: authorization.role,
      welcomeSent: welcome.status === "SENT",
      verificationSent: verification ? verification.status === "SENT" : true,
    };
  },
);
