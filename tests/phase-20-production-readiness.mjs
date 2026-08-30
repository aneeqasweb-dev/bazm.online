import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const staticOnly = process.argv.includes("--static-only");
const projectId = process.env.GCLOUD_PROJECT ?? "demo-bazm-online";

async function source(relativePath) {
  return readFile(join(repoRoot, relativePath), "utf8");
}

async function assertStaticReadiness() {
  const requiredDocs = {
    "docs/data-migration-and-recovery.md": [
      "## Backup policy",
      "## Restore drill",
      "## Data migration plan",
    ],
    "docs/operations-runbook.md": [
      "## Alert response",
      "## Incident contacts",
      "## Payment incident",
    ],
    "docs/provider-readiness.md": [
      "## Readiness matrix",
      "BLOCKED",
      "Analytics consent",
    ],
    "docs/release-checklist.md": [
      "## Release checklist",
      "## Rollback plan",
      "## Approval record",
    ],
  };
  for (const [path, markers] of Object.entries(requiredDocs)) {
    const content = await source(path);
    for (const marker of markers) {
      assert.ok(content.includes(marker), `${path} is missing ${marker}`);
    }
  }

  const footer = await source("frontend/src/components/store/store-shell.tsx");
  const legalRoutes = [
    "about",
    "contact",
    "faq",
    "shipping",
    "returns",
    "privacy",
    "terms",
  ];
  for (const route of legalRoutes) {
    const page = await source(`frontend/src/app/${route}/page.tsx`);
    assert.ok(page.includes("publicMetadata"), `/${route} needs metadata`);
    assert.ok(
      footer.includes(`href=\"/${route}\"`),
      `Footer is missing /${route}`,
    );
  }

  const runtime = await source("functions/src/config/runtime.ts");
  for (const marker of [
    "maxInstances: 20",
    "concurrency: 40",
    'memory: "512MiB"',
    "timeoutSeconds: 60",
  ]) {
    assert.ok(runtime.includes(marker), `Runtime limits are missing ${marker}`);
  }
  const health = await source("frontend/src/app/api/health/route.ts");
  assert.ok(health.includes('status: "ok"'));
  assert.ok(health.includes('"Cache-Control": "no-store'));
  const nextConfig = await source("frontend/next.config.ts");
  assert.ok(
    nextConfig.includes("dangerouslyAllowLocalIP: usesFirebaseEmulators"),
    "Private-IP image optimization must be emulator-only",
  );
  const packageJson = JSON.parse(await source("package.json"));
  assert.ok(
    packageJson.scripts["test:emulators"].includes("npm run prepare:emulators"),
    "The emulator gate must prepare local Secret Manager values",
  );
  assert.ok(
    packageJson.scripts["test:emulators"].includes(
      "METADATA_SERVER_DETECTION=none",
    ),
    "Emulator tests must disable cloud metadata probing",
  );
  assert.ok(
    packageJson.scripts["test:emulators"].includes("DEBUG= "),
    "Emulator tests must not inherit verbose debug logging",
  );
  assert.ok(
    packageJson.scripts["emulators"].includes("npm run prepare:emulators"),
    "Interactive emulators must prepare local Secret Manager values",
  );
  const gitignore = await source(".gitignore");
  assert.ok(
    gitignore.includes("functions/.secret.local"),
    "Emulator secret values must be ignored",
  );
  const emulatorSecrets = await source("functions/.secret.local.example");
  assert.ok(emulatorSecrets.includes("emulator-only dummy values"));
  assert.ok(emulatorSecrets.includes("EMAIL_PROVIDER_API_KEY="));
  assert.ok(emulatorSecrets.includes("PAYMENT_WEBHOOK_SECRET="));

  const terraform = JSON.parse(
    await source("ops/terraform/production-readiness.tf.json"),
  );
  const resources = terraform.resource;
  for (const kind of [
    "google_billing_budget",
    "google_firestore_backup_schedule",
    "google_logging_metric",
    "google_monitoring_alert_policy",
    "google_monitoring_uptime_check_config",
  ]) {
    assert.ok(resources[kind], `Terraform is missing ${kind}`);
  }
}

function encode(value) {
  if (value instanceof Timestamp) {
    return { type: "timestamp", value: value.toDate().toISOString() };
  }
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, encode(child)]),
    );
  }
  return value;
}

function decode(value) {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === "object") {
    if (value.type === "timestamp" && typeof value.value === "string") {
      return Timestamp.fromDate(new Date(value.value));
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, decode(child)]),
    );
  }
  return value;
}

async function rehearseRestore() {
  assert.ok(
    process.env.FIRESTORE_EMULATOR_HOST,
    "Restore rehearsal is restricted to the Firestore emulator",
  );
  assert.match(
    projectId,
    /^demo-/,
    "Restore rehearsal requires a demo project",
  );
  const app = getApps()[0] ?? initializeApp({ projectId });
  const firestore = getFirestore(app);
  const drillId = `phase20-${Date.now()}`;
  const reference = firestore
    .collection("operationsRestoreDrills")
    .doc(drillId);
  const original = {
    checks: ["orders", "payments", "inventory"],
    nested: { count: 3, ready: true },
    performedAt: Timestamp.now(),
    schemaVersion: 1,
  };
  const directory = await mkdtemp(join(tmpdir(), "bazm-restore-drill-"));
  const exportPath = join(directory, "restore-drill.json");

  try {
    await reference.set(original);
    const snapshot = await reference.get();
    assert.ok(snapshot.exists, "Restore drill fixture was not written");
    await writeFile(
      exportPath,
      JSON.stringify({ id: snapshot.id, value: encode(snapshot.data()) }),
      { encoding: "utf8", mode: 0o600 },
    );
    await reference.delete();
    assert.equal(
      (await reference.get()).exists,
      false,
      "Fixture delete failed",
    );

    const backup = JSON.parse(await readFile(exportPath, "utf8"));
    assert.equal(backup.id, drillId);
    await reference.set(decode(backup.value));
    const restored = await reference.get();
    assert.deepEqual(encode(restored.data()), encode(original));
    await reference.delete();
  } finally {
    await rm(directory, { recursive: true });
  }
}

await assertStaticReadiness();
if (!staticOnly) await rehearseRestore();
console.log(
  staticOnly
    ? "Phase 20 static production-readiness checks passed."
    : "Phase 20 production-readiness checks and emulator restore rehearsal passed.",
);
