"use client";

import {
  applyActionCode,
  browserLocalPersistence,
  confirmPasswordReset,
  GoogleAuthProvider,
  reload,
  sendEmailVerification as sendFirebaseEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  verifyPasswordResetCode,
  type User,
} from "firebase/auth";

import { getFirebaseClientEnv } from "@/lib/env/client";
import { getFirebaseClientServices } from "@/lib/firebase/client";

import type { LoginInput } from "./auth-schema";
import {
  completeRegistration,
  synchronizeAuthorization,
  type AuthorizationResult,
} from "./authorization-client";
import { createServerSession, deleteServerSession } from "./session-client";

async function synchronizeAndCreateSession(user: User) {
  const authorization: AuthorizationResult =
    await synchronizeAuthorization(user);
  const idToken = await user.getIdToken(true);
  await createServerSession(idToken);
  return authorization;
}

export async function loginWithEmail(input: LoginInput) {
  const { auth } = getFirebaseClientServices();
  await setPersistence(auth, browserLocalPersistence);
  const credential = await signInWithEmailAndPassword(
    auth,
    input.email,
    input.password,
  );

  try {
    return await synchronizeAndCreateSession(credential.user);
  } catch (error) {
    await signOut(auth).catch(() => undefined);
    await deleteServerSession().catch(() => undefined);
    throw error;
  }
}

export function isGoogleAuthEnabled() {
  return isGoogleAuthConfigured(
    getFirebaseClientEnv().NEXT_PUBLIC_ENABLE_GOOGLE_AUTH,
  );
}

export function isGoogleAuthConfigured(value: string | undefined) {
  return value === "true";
}

export async function loginWithGoogle() {
  if (!isGoogleAuthEnabled()) {
    throw new Error("GOOGLE_AUTH_DISABLED");
  }

  const { auth } = getFirebaseClientServices();
  await setPersistence(auth, browserLocalPersistence);
  const credential = await signInWithPopup(auth, new GoogleAuthProvider());

  try {
    await completeRegistration(
      credential.user,
      credential.user.displayName?.trim() || "Bazm customer",
    );
    return await synchronizeAndCreateSession(credential.user);
  } catch (error) {
    await signOut(auth).catch(() => undefined);
    await deleteServerSession().catch(() => undefined);
    throw error;
  }
}

export async function logout() {
  const { auth } = getFirebaseClientServices();
  await Promise.allSettled([deleteServerSession(), signOut(auth)]);
}

export async function sendVerificationEmail() {
  const { auth } = getFirebaseClientServices();
  await auth.authStateReady();
  if (!auth.currentUser) {
    throw new Error("AUTHENTICATION_REQUIRED");
  }

  await sendFirebaseEmailVerification(auth.currentUser);
}

export async function applyEmailVerificationCode(code: string) {
  const { auth } = getFirebaseClientServices();
  await auth.authStateReady();
  await applyActionCode(auth, code);

  if (auth.currentUser) {
    await reload(auth.currentUser);
    return synchronizeAndCreateSession(auth.currentUser);
  }

  return null;
}

export async function requestPasswordReset(email: string) {
  await sendPasswordResetEmail(getFirebaseClientServices().auth, email);
}

export async function inspectPasswordResetCode(code: string) {
  return verifyPasswordResetCode(getFirebaseClientServices().auth, code);
}

export async function resetPassword(code: string, password: string) {
  await confirmPasswordReset(getFirebaseClientServices().auth, code, password);
}
