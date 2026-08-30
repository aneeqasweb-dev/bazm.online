"use client";

import {
  applyActionCode,
  browserLocalPersistence,
  confirmPasswordReset,
  GoogleAuthProvider,
  reload,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  verifyPasswordResetCode,
  type User,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";

import { getFirebaseClientEnv } from "@/lib/env/client";
import { getFirebaseClientServices } from "@/lib/firebase/client";

import type { LoginInput } from "./auth-schema";
import { createServerSession, deleteServerSession } from "./session-client";

type AuthorizationResult = {
  ok: true;
  role: "CUSTOMER" | "STAFF" | "ADMIN" | "SUPER_ADMIN";
  emailVerified: boolean;
};

async function synchronizeAndCreateSession(user: User) {
  const { functions } = getFirebaseClientServices();
  const synchronizeAuthorization = httpsCallable<
    Record<string, never>,
    AuthorizationResult
  >(functions, "synchronizeAuthorization");
  const authorization = await synchronizeAuthorization({});
  const idToken = await user.getIdToken(true);
  await createServerSession(idToken);
  return authorization.data;
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

  const { auth, functions } = getFirebaseClientServices();
  await setPersistence(auth, browserLocalPersistence);
  const credential = await signInWithPopup(auth, new GoogleAuthProvider());

  try {
    const completeRegistration = httpsCallable<{ name: string }, { ok: true }>(
      functions,
      "completeRegistration",
    );
    await completeRegistration({
      name: credential.user.displayName?.trim() || "Bazm customer",
    });
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
  const { auth, functions } = getFirebaseClientServices();
  await auth.authStateReady();
  if (!auth.currentUser) {
    throw new Error("AUTHENTICATION_REQUIRED");
  }

  const requestVerification = httpsCallable<
    Record<string, never>,
    { ok: true }
  >(functions, "sendVerificationEmail");
  await requestVerification({});
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
  const { functions } = getFirebaseClientServices();
  const requestReset = httpsCallable<{ email: string }, { ok: true }>(
    functions,
    "requestPasswordResetEmail",
  );
  await requestReset({ email });
}

export async function inspectPasswordResetCode(code: string) {
  return verifyPasswordResetCode(getFirebaseClientServices().auth, code);
}

export async function resetPassword(code: string, password: string) {
  await confirmPasswordReset(getFirebaseClientServices().auth, code, password);
}
