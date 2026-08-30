import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT ?? "3119";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

const emulatorEnv = {
  ...process.env,
  FIREBASE_AUTH_EMULATOR_HOST:
    process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099",
  FIRESTORE_EMULATOR_HOST:
    process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8081",
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? baseURL,
  NEXT_PUBLIC_ENABLE_GOOGLE_AUTH:
    process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH ?? "false",
  NEXT_PUBLIC_FIREBASE_API_KEY:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "demo-api-key",
  NEXT_PUBLIC_FIREBASE_APP_ID:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "1:123:web:phase19",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ??
    "demo-bazm-online.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "123",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-bazm-online",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
    "demo-bazm-online.appspot.com",
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS:
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS ?? "true",
};

export default defineConfig({
  expect: { timeout: 10_000 },
  forbidOnly: true,
  fullyParallel: false,
  outputDir: "test-results/playwright-artifacts",
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { height: 1100, width: 1440 },
      },
    },
    {
      name: "mobile-chromium",
      use: devices["Pixel 5"],
    },
  ],
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "test-results/playwright-report" }],
    ["json", { outputFile: "test-results/playwright-results.json" }],
  ],
  retries: process.env.CI ? 1 : 0,
  testDir: "./tests/e2e",
  timeout: 90_000,
  use: {
    actionTimeout: 15_000,
    baseURL,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer:
    process.env.PLAYWRIGHT_SKIP_WEB_SERVER === "true"
      ? undefined
      : {
          command: `node ../node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${port}`,
          cwd: "./frontend",
          env: emulatorEnv,
          reuseExistingServer: process.env.CI !== "true",
          timeout: 120_000,
          url: baseURL,
        },
  workers: 1,
});
