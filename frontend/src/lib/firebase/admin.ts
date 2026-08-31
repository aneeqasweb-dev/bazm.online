import "server-only";

import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function configureEmulators() {
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true") {
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
    process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8081";
  }
}

function getProductionCredential() {
  const serviceAccountJson = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) return applicationDefault();

  let serviceAccount: ServiceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson) as ServiceAccount;
  } catch {
    throw new Error("FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON must be valid JSON.");
  }

  return cert(serviceAccount);
}

export function getFirebaseAdminApp() {
  configureEmulators();
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  return (
    getApps()[0] ??
    initializeApp(
      process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true"
        ? { projectId }
        : { credential: getProductionCredential(), projectId },
    )
  );
}

export function getServerAuth() {
  return getAuth(getFirebaseAdminApp());
}

export function getServerFirestore() {
  return getFirestore(getFirebaseAdminApp());
}
