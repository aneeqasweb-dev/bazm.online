"use client";

import {
  getAnalytics,
  isSupported,
  setAnalyticsCollectionEnabled,
  type Analytics,
} from "firebase/analytics";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from "firebase/app-check";

import { getFirebaseBrowserIntegrationEnv } from "@/lib/env/client";
import { getFirebaseClientServices } from "@/lib/firebase/client";

let appCheckInitialization: Promise<AppCheck | null> | undefined;
let analyticsInitialization: Promise<Analytics | null> | undefined;

export function initializeFirebaseAppCheck() {
  appCheckInitialization ??= initializeAppCheckIntegration();
  return appCheckInitialization;
}

async function initializeAppCheckIntegration(): Promise<AppCheck | null> {
  const env = getFirebaseBrowserIntegrationEnv();

  if (env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true") {
    getFirebaseClientServices();
    return null;
  }

  const { app } = getFirebaseClientServices();
  const siteKey = env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY;
  if (!siteKey) {
    throw new Error("Firebase App Check configuration is required.");
  }

  const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
  return appCheck;
}

async function initializeAnalyticsIntegration(): Promise<Analytics | null> {
  const env = getFirebaseBrowserIntegrationEnv();
  if (
    env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true" ||
    !env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ||
    !(await isSupported())
  ) {
    return null;
  }
  return getAnalytics(getFirebaseClientServices().app);
}

export async function setFirebaseAnalyticsConsent(enabled: boolean) {
  if (!enabled && !analyticsInitialization) return null;
  analyticsInitialization ??= initializeAnalyticsIntegration();
  const analytics = await analyticsInitialization;
  if (analytics) setAnalyticsCollectionEnabled(analytics, enabled);
  return analytics;
}
