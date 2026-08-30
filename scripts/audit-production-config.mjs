import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const requestedEnvironment = process.argv.find((value, index, values) =>
  values[index - 1] === "--environment" ? value : false,
);
const environments = new Set(["staging", "production"]);

const publicVariables = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_ENABLE_GOOGLE_AUTH",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY",
  "NEXT_PUBLIC_USE_FIREBASE_EMULATORS",
];
const requiredPublicVariables = publicVariables.filter(
  (name) => name !== "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID",
);
const serverVariables = [
  "APP_URL",
  "EMAIL_FROM_EMAIL",
  "EMAIL_FROM_NAME",
  "EMAIL_PROVIDER",
  "EMAIL_PROVIDER_ENDPOINT",
];
const managedSecrets = ["EMAIL_PROVIDER_API_KEY", "PAYMENT_WEBHOOK_SECRET"];
const excludedDirectories = new Set([
  ".firebase",
  ".git",
  ".next",
  "coverage",
  "node_modules",
  "test-results",
]);

function envNames(path) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split("=", 1)[0]);
}

function walk(path) {
  return readdirSync(path).flatMap((name) => {
    const absolute = join(path, name);
    if (statSync(absolute).isDirectory()) {
      return excludedDirectories.has(name) ? [] : walk(absolute);
    }
    if (name.startsWith(".env") && name !== ".env.example") return [];
    return [absolute];
  });
}

function assertTemplates() {
  const clientTemplate = join(repoRoot, "frontend/.env.example");
  const serverTemplate = join(repoRoot, "functions/.env.example");
  assert.ok(existsSync(clientTemplate), "Missing frontend/.env.example");
  assert.ok(existsSync(serverTemplate), "Missing functions/.env.example");

  const clientNames = envNames(clientTemplate).sort();
  const serverNames = envNames(serverTemplate).sort();
  assert.deepEqual(
    clientNames,
    publicVariables.sort(),
    "Client environment template drifted from the approved public allowlist",
  );
  assert.deepEqual(
    serverNames,
    serverVariables.sort(),
    "Functions environment template drifted from the non-secret allowlist",
  );
  for (const secret of managedSecrets) {
    assert.ok(
      !clientNames.includes(secret) && !serverNames.includes(secret),
      `${secret} must be supplied only by Firebase Secret Manager`,
    );
  }
}

function assertSecretManagerBoundaries() {
  const paymentSource = readFileSync(
    join(repoRoot, "functions/src/payments/payment.ts"),
    "utf8",
  );
  const emailSource = readFileSync(
    join(repoRoot, "functions/src/email/email.ts"),
    "utf8",
  );
  assert.match(paymentSource, /defineSecret\("PAYMENT_WEBHOOK_SECRET"\)/);
  assert.match(paymentSource, /secrets:\s*\[paymentWebhookSecret\]/);
  assert.match(emailSource, /defineSecret\("EMAIL_PROVIDER_API_KEY"\)/);
  assert.match(emailSource, /secrets:\s*\[emailProviderApiKey\]/);

  const secretPatterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/,
    /\bsk_live_[A-Za-z0-9]{20,}\b/,
    /"private_key"\s*:\s*"-----BEGIN/,
  ];
  const findings = [];
  for (const path of walk(repoRoot)) {
    if (!/\.(?:cjs|js|json|md|mjs|rules|ts|tsx|yml|yaml)$/.test(path)) {
      continue;
    }
    const source = readFileSync(path, "utf8");
    if (secretPatterns.some((pattern) => pattern.test(source))) {
      findings.push(relative(repoRoot, path));
    }
  }
  assert.deepEqual(
    findings,
    [],
    "Potential committed credential material found",
  );
}

function assertClientBundleBoundary() {
  const staticRoot = join(repoRoot, "frontend/.next/static");
  if (!existsSync(staticRoot)) return;
  const findings = [];
  for (const path of walk(staticRoot)) {
    if (!/\.(?:js|json)$/.test(path)) continue;
    const source = readFileSync(path, "utf8");
    for (const secret of managedSecrets) {
      if (source.includes(secret)) {
        findings.push(`${relative(repoRoot, path)} contains ${secret}`);
      }
    }
  }
  assert.deepEqual(
    findings,
    [],
    "A server secret name reached the client bundle",
  );
}

function required(name) {
  const value = process.env[name]?.trim();
  assert.ok(value, `${name} is required`);
  assert.ok(
    !/(?:change-me|demo-|example|invalid|localhost|placeholder|test)/i.test(
      value,
    ),
    `${name} contains a development or placeholder value`,
  );
  return value;
}

function assertRuntimeEnvironment(environment) {
  assert.ok(
    environments.has(environment),
    "--environment must be staging or production",
  );
  for (const name of requiredPublicVariables) required(name);
  for (const name of managedSecrets) {
    assert.equal(
      process.env[name],
      undefined,
      `${name} must come from Secret Manager, not the web build environment`,
    );
  }
  assert.equal(
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS,
    "false",
    "Release builds must not use Firebase emulators",
  );
  const appUrl = new URL(required("NEXT_PUBLIC_APP_URL"));
  assert.equal(appUrl.protocol, "https:", "Release URL must use HTTPS");
  assert.equal(appUrl.pathname, "/", "Release URL must be an origin");
  assert.equal(appUrl.search, "", "Release URL must not include a query");
  assert.equal(appUrl.hash, "", "Release URL must not include a fragment");

  const endpoint = new URL(required("EMAIL_PROVIDER_ENDPOINT"));
  assert.equal(endpoint.protocol, "https:", "Email endpoint must use HTTPS");
  assert.equal(required("EMAIL_PROVIDER").toUpperCase(), "HTTP");
  assert.match(required("EMAIL_FROM_EMAIL"), /^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  assert.equal(new URL(required("APP_URL")).origin, appUrl.origin);
}

assertTemplates();
assertSecretManagerBoundaries();
assertClientBundleBoundary();
if (requestedEnvironment) assertRuntimeEnvironment(requestedEnvironment);

console.log(
  JSON.stringify({
    clientBundleScanned: existsSync(join(repoRoot, "frontend/.next/static")),
    environment: requestedEnvironment ?? "templates",
    managedSecrets,
    ok: true,
    publicVariableCount: publicVariables.length,
  }),
);
