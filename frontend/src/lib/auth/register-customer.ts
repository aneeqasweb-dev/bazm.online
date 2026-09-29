"use client";

import { FirebaseError } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  sendEmailVerification,
} from "firebase/auth";

import { getFirebaseClientServices } from "@/lib/firebase/client";

import type { RegistrationInput } from "./registration-schema";
import { completeRegistration } from "./authorization-client";
import { createServerSession } from "./session-client";
import { emailActionSettings } from "./email-action-settings";

export type RegistrationResult = { verificationSent: boolean };

export async function registerCustomer(
  input: RegistrationInput,
  nextPath = "/account",
): Promise<RegistrationResult> {
  const { auth } = getFirebaseClientServices();
  const credential = await createUserWithEmailAndPassword(
    auth,
    input.email,
    input.password,
  );

  let emailVerified = false;
  try {
    const registration = await completeRegistration(
      credential.user,
      input.name,
    );
    emailVerified = registration.emailVerified;
  } catch (error) {
    await deleteUser(credential.user).catch(() => undefined);
    throw error;
  }

  let verificationSent = false;
  if (!emailVerified) {
    verificationSent = await sendEmailVerification(
      credential.user,
      emailActionSettings("verify", nextPath),
    ).then(
      () => true,
      () => false,
    );
  }

  await createServerSession(await credential.user.getIdToken(true));
  return { verificationSent };
}

export function getRegistrationErrorMessage(error: unknown): string {
  if (error instanceof FirebaseError) {
    if (error.code === "auth/email-already-in-use") {
      return "An account already exists for this email. Try signing in instead.";
    }
    if (error.code === "auth/weak-password") {
      return "Choose a stronger password and try again.";
    }
    if (error.code === "auth/invalid-email") {
      return "Enter a valid email address.";
    }
  }

  return "We could not create your account. Please try again.";
}
