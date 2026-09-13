import { readFileSync } from "node:fs";

import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

for (const line of readFileSync("frontend/.env.local", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && process.env[match[1]] === undefined) {
    process.env[match[1]] = match[2];
  }
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const email = argument("--email")?.trim().toLowerCase();
const confirmed = process.argv.includes("--confirm-super-admin");

if (projectId !== "bazmonline-staging-aneeqa") {
  throw new Error(`Refusing to modify ${projectId ?? "an unknown project"}.`);
}
if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
  throw new Error(
    "Provide the registered account with --email user@example.com.",
  );
}
if (!confirmed) {
  throw new Error(
    "Add --confirm-super-admin to confirm this privileged change.",
  );
}

const app = initializeApp(
  { credential: applicationDefault(), projectId },
  "staging-admin-bootstrap",
);
const auth = getAuth(app);
const database = getFirestore(app);
const user = await auth.getUserByEmail(email);

if (!user.emailVerified) {
  throw new Error("Verify this account's email before granting admin access.");
}

const users = await auth.listUsers(1000);
const otherSuperAdmin = users.users.find(
  (candidate) =>
    candidate.uid !== user.uid &&
    candidate.customClaims?.role === "SUPER_ADMIN",
);
if (otherSuperAdmin) {
  throw new Error(
    "A different SUPER_ADMIN already exists; use the audited admin UI for role changes.",
  );
}

const profileRef = database.collection("users").doc(user.uid);
const profile = await profileRef.get();
if (!profile.exists) {
  throw new Error("The account must complete registration before promotion.");
}

await database.runTransaction(async (transaction) => {
  transaction.update(profileRef, {
    role: "SUPER_ADMIN",
    permissions: [],
    isActive: true,
    emailVerified: true,
    updatedAt: FieldValue.serverTimestamp(),
  });
  transaction.create(database.collection("auditLogs").doc(), {
    action: "BOOTSTRAP_SUPER_ADMIN",
    actorId: user.uid,
    targetType: "user",
    targetId: user.uid,
    metadata: { environment: "staging", method: "local-bootstrap" },
    correlationId: `admin-bootstrap-${crypto.randomUUID()}`,
    schemaVersion: 1,
    createdAt: FieldValue.serverTimestamp(),
  });
});

await auth.setCustomUserClaims(user.uid, {
  role: "SUPER_ADMIN",
  isActive: true,
  claimsVersion: 1,
});
await auth.revokeRefreshTokens(user.uid);

console.log("Staging SUPER_ADMIN configured. Sign in again to refresh claims.");
