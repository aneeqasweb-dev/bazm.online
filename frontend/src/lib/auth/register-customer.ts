"use client";

import { FirebaseError } from "firebase/app";
import { createUserWithEmailAndPassword, deleteUser } from "firebase/auth";
import { httpsCallable } from "firebase/functions";

import { getFirebaseClientServices } from "@/lib/firebase/client";

import type { RegistrationInput } from "./registration-schema";
import { createServerSession } from "./session-client";

export type RegistrationResult = { verificationSent: boolean };

export async function registerCustomer(
  input: RegistrationInput,
): Promise<RegistrationResult> {
  const { auth, functions } = getFirebaseClientServices();
  const credential = await createUserWithEmailAndPassword(
    auth,
    input.email,
    input.password,
  );

  let verificationSent = false;
  try {
    const completeRegistration = httpsCallable<
      { name: string },
      { ok: true; verificationSent: boolean }
    >(functions, "completeRegistration");
    const registration = await completeRegistration({ name: input.name });
    verificationSent = registration.data.verificationSent;
  } catch (error) {
    await deleteUser(credential.user).catch(() => undefined);
    throw error;
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
