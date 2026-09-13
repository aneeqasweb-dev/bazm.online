import { z } from "zod";

const firebaseClientEnvSchema = z.object({
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: z.string().min(1).optional(),
  NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_ENABLE_FIREBASE_APP_CHECK: z
    .enum(["true", "false"])
    .default("false"),
  NEXT_PUBLIC_APP_URL: z.url().optional(),
  NEXT_PUBLIC_ENABLE_GOOGLE_AUTH: z.enum(["true", "false"]).default("false"),
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS: z
    .enum(["true", "false"])
    .default("false"),
});

export type FirebaseClientEnv = z.infer<typeof firebaseClientEnvSchema>;

export function getFirebaseClientEnv(): FirebaseClientEnv {
  return firebaseClientEnvSchema.parse({
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID:
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID:
      process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
    NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY:
      process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY,
    NEXT_PUBLIC_ENABLE_FIREBASE_APP_CHECK:
      process.env.NEXT_PUBLIC_ENABLE_FIREBASE_APP_CHECK,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_ENABLE_GOOGLE_AUTH: process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH,
    NEXT_PUBLIC_USE_FIREBASE_EMULATORS:
      process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS,
  });
}

export function getFirebaseBrowserIntegrationEnv(
  runtime = process.env.NODE_ENV,
): FirebaseClientEnv {
  const env = getFirebaseClientEnv();

  if (
    runtime === "production" &&
    env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS !== "true" &&
    env.NEXT_PUBLIC_ENABLE_FIREBASE_APP_CHECK === "true" &&
    !env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY
  ) {
    throw new Error(
      "Firebase App Check configuration is required in production.",
    );
  }

  return env;
}
