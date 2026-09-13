import { afterEach, describe, expect, it } from "vitest";

import {
  getFirebaseBrowserIntegrationEnv,
  getFirebaseClientEnv,
} from "./client";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("getFirebaseClientEnv", () => {
  it("accepts a complete Firebase client configuration", () => {
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "test-api-key";
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = "demo.local";
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-bazm-online";
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = "demo.appspot.com";
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = "123";
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID = "1:123:web:test";
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS = "true";

    expect(getFirebaseClientEnv().NEXT_PUBLIC_FIREBASE_PROJECT_ID).toBe(
      "demo-bazm-online",
    );
  });

  it("rejects missing Firebase configuration", () => {
    delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

    expect(() => getFirebaseClientEnv()).toThrow();
  });

  it("allows production cloud use when App Check is explicitly disabled", () => {
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "test-api-key";
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = "demo.local";
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-bazm-online";
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = "demo.appspot.com";
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = "123";
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID = "1:123:web:test";
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS = "false";
    process.env.NEXT_PUBLIC_ENABLE_FIREBASE_APP_CHECK = "false";
    delete process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY;

    expect(
      getFirebaseBrowserIntegrationEnv("production")
        .NEXT_PUBLIC_ENABLE_FIREBASE_APP_CHECK,
    ).toBe("false");
  });

  it("requires a site key when production App Check is enabled", () => {
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "test-api-key";
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = "demo.local";
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-bazm-online";
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = "demo.appspot.com";
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = "123";
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID = "1:123:web:test";
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS = "false";
    process.env.NEXT_PUBLIC_ENABLE_FIREBASE_APP_CHECK = "true";
    delete process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY;

    expect(() => getFirebaseBrowserIntegrationEnv("production")).toThrow(
      "Firebase App Check configuration is required in production.",
    );
  });

  it("allows local emulator mode without App Check", () => {
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY = "test-api-key";
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = "demo.local";
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-bazm-online";
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = "demo.appspot.com";
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = "123";
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID = "1:123:web:test";
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS = "true";
    delete process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY;

    expect(
      getFirebaseBrowserIntegrationEnv("production")
        .NEXT_PUBLIC_USE_FIREBASE_EMULATORS,
    ).toBe("true");
  });
});
