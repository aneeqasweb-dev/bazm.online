import "server-only";

import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function configureEmulators() {
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true") {
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
    process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8081";
  }
}

export function getFirebaseAdminApp() {
  configureEmulators();
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  return (
    getApps()[0] ??
    initializeApp(
      process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true"
        ? { projectId }
        : { credential: applicationDefault(), projectId },
    )
  );
}

export function getServerAuth() {
  return getAuth(getFirebaseAdminApp());
}

export function getServerFirestore() {
  return getFirestore(getFirebaseAdminApp());
}
