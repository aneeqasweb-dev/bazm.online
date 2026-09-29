import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync, mkdirSync } from "node:fs";
import { parseEnv } from "node:util";
import { homedir } from "node:os";
import {
  initializeApp,
  applicationDefault,
  cert,
  deleteApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { chromium, expect as baseExpect } from "@playwright/test";

const expect = baseExpect.configure({ timeout: 60000 });
const env = parseEnv(readFileSync("frontend/.env.local", "utf8"));
assert.equal(env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, "bazmonline-staging-aneeqa");
assert.ok(
  !process.env.FIRESTORE_EMULATOR_HOST &&
    !process.env.FIREBASE_AUTH_EMULATOR_HOST,
);
process.env.GOOGLE_APPLICATION_CREDENTIALS ??=
  env.GOOGLE_APPLICATION_CREDENTIALS;
const base = process.env.AUTH_FLOW_BASE_URL ?? "http://127.0.0.1:3000";
const target = new URL(base);
const preview =
  /^bazm-online-frontend-[a-z0-9]+-aneeqadev-6239s-projects\.vercel\.app$/.test(
    target.hostname,
  );
assert.ok(
  ["127.0.0.1", "localhost"].includes(target.hostname) ||
    target.origin === "https://bazm-online-frontend.vercel.app" ||
    (preview && target.protocol === "https:"),
);
const headers = {};
if (preview) {
  const { token } = JSON.parse(
    readFileSync(`${homedir()}/.local/share/com.vercel.cli/auth.json`, "utf8"),
  );
  const response = await fetch(
    "https://api.vercel.com/v9/projects/prj_EJaOUvs2AYTbScUisKkW1cNTwEbM",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  assert.ok(response.ok);
  const project = await response.json();
  const bypass = Object.keys(project.protectionBypass ?? {})[0];
  assert.ok(bypass);
  headers["x-vercel-protection-bypass"] = bypass;
}
const app = initializeApp({
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  credential: env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON
    ? cert(JSON.parse(env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON))
    : applicationDefault(),
});
const auth = getAuth(app),
  db = getFirestore(app);
const run = `qa-auth-${Date.now()}-${randomBytes(3).toString("hex")}`;
const email = `${run}@example.test`,
  password = `QA1!${randomBytes(12).toString("hex")}`,
  newPassword = `New1!${randomBytes(12).toString("hex")}`;
let uid, browser, context, page;
const guestIds = new Set();
const emailRequests = [];
mkdirSync("test-results/auth-flow", { recursive: true });
try {
  browser = await chromium.launch();
  context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  await context.addInitScript(() =>
    localStorage.setItem("bazm.analytics-consent.v1", "denied"),
  );
  if (preview)
    await context.route(`${target.origin}/**`, (route) =>
      route.continue({ headers: { ...route.request().headers(), ...headers } }),
    );
  // Exercise actual registration/sign-in without sending mail to any mailbox.
  // Admin-generated action links below validate the configured continue URL.
  await context.route(
    "https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode*",
    async (route) => {
      const body = route.request().postDataJSON();
      emailRequests.push({ type: body.requestType, url: body.continueUrl });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ email }),
      });
    },
  );
  page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}/product/ivory-meher-top-handle-bag`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.getByRole("button", { name: "Buy it now", exact: true }).click();
  await expect(page).toHaveURL(`${base}/checkout`);
  for (const cookie of await context.cookies())
    if (cookie.name === "bazm_guest_cart") guestIds.add(cookie.value);
  await page
    .getByRole("link", { name: "Sign in to pay", exact: true })
    .first()
    .click();
  await page
    .getByRole("navigation", { name: "Account access" })
    .getByRole("link", { name: "Create account", exact: true })
    .click();
  await expect(page).toHaveURL(`${base}/register?next=%2Fcheckout`);
  await expect(page.locator("form input")).toHaveCount(3);
  await page.getByLabel("Full name", { exact: true }).fill("QA Auth Shopper");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "You’re almost there" }),
  ).toBeVisible();
  uid = (await auth.getUserByEmail(email)).uid;
  await page
    .getByRole("link", { name: "Continue to verification", exact: true })
    .click();
  await expect(page).toHaveURL(`${base}/verify-email?next=%2Fcheckout`);
  await expect(
    page.getByRole("button", { name: "I’ve verified my email", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "I’ve verified my email", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "isn’t verified yet",
  );
  const verifyRequest = emailRequests.find(
    (item) => item.type === "VERIFY_EMAIL",
  );
  assert.ok(verifyRequest?.url);
  assert.equal(new URL(verifyRequest.url).pathname, "/verify-email");
  assert.equal(
    new URL(verifyRequest.url).searchParams.get("next"),
    "/checkout",
  );
  const verification = new URL(
    await auth.generateEmailVerificationLink(email, { url: verifyRequest.url }),
  );
  const redeemed = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        oobCode: verification.searchParams.get("oobCode"),
      }),
    },
  );
  assert.ok(redeemed.ok, "Email verification code could not be redeemed.");
  await page
    .getByRole("button", { name: "I’ve verified my email", exact: true })
    .click();
  await expect(page).toHaveURL(`${base}/checkout`);
  await expect(
    page.getByRole("button", { name: "Pay Now", exact: true }),
  ).toBeVisible();
  const items = await db.collection("carts").doc(uid).collection("items").get();
  assert.equal(items.size, 1);
  assert.equal(items.docs[0].get("requestedQuantity"), 1);
  assert.equal((await db.doc(`users/${uid}`).get()).get("emailVerified"), true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("button", { name: "Pay Now", exact: true }),
  ).toBeVisible();
  console.log(
    "PASS new customer: three-field signup, email verification, refreshed verified session, saved bag and return to checkout",
  );

  await page.goto(`${base}/account`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(`${base}/login`);
  assert.ok(
    !(await context.cookies()).some((cookie) => cookie.name === "bazm_session"),
  );
  await page.goto(`${base}/login?next=%2Fcheckout`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("Incorrect123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "email or password is incorrect",
  );
  await page
    .getByRole("link", { name: "Forgot password?", exact: true })
    .click();
  await expect(page).toHaveURL(`${base}/forgot-password?next=%2Fcheckout`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByRole("button", { name: "Send reset link", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "has been sent",
  );
  const resetRequest = emailRequests.find(
    (item) => item.type === "PASSWORD_RESET",
  );
  assert.ok(resetRequest?.url);
  assert.equal(new URL(resetRequest.url).searchParams.get("next"), "/checkout");
  const resetLink = new URL(
    await auth.generatePasswordResetLink(email, { url: resetRequest.url }),
  );
  const resetQuery = new URLSearchParams({
    oobCode: resetLink.searchParams.get("oobCode"),
    continueUrl: resetRequest.url,
  });
  await page.goto(`${base}/reset-password?${resetQuery}`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page
    .getByLabel("Confirm new password", { exact: true })
    .fill(newPassword);
  await page
    .getByRole("button", { name: "Update password", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("status")).toContainText(
    "password has been updated",
  );
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(`${base}/login?reset=complete&next=%2Fcheckout`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(`${base}/checkout`);
  await expect(
    page.getByRole("button", { name: "Pay Now", exact: true }),
  ).toBeVisible();
  console.log(
    "PASS returning customer: sign-out, wrong-password feedback, actual password reset, new-password login and checkout destination",
  );
  await page.goto(
    `${base}/reset-password?oobCode=invalid-test-code&next=%2Fcheckout`,
    { waitUntil: "domcontentloaded" },
  );
  await expect(
    page.getByRole("link", { name: "Request a new reset link", exact: true }),
  ).toHaveAttribute("href", "/forgot-password?next=%2Fcheckout");
  assert.deepEqual(errors, []);
  console.log(
    "PASS invalid-link recovery; no browser errors. Email delivery was intercepted; action codes were generated and redeemed with Firebase.",
  );
} catch (error) {
  if (page)
    await page.screenshot({
      path: "test-results/auth-flow/failure.png",
      fullPage: true,
    });
  throw error;
} finally {
  if (context)
    for (const cookie of await context.cookies())
      if (cookie.name === "bazm_guest_cart") guestIds.add(cookie.value);
  await browser?.close();
  uid ??= await auth.getUserByEmail(email).then(
    (user) => user.uid,
    (error) => {
      if (error.code !== "auth/user-not-found") throw error;
      return undefined;
    },
  );
  const paths = new Set([...guestIds].map((id) => `guestCarts/${id}`));
  if (uid) {
    for (const collection of ["users", "carts", "wishlists"])
      paths.add(`${collection}/${uid}`);
    await Promise.all(
      ["auditLogs", "customerActivities"].map(async (collection) => {
        const found = await db
          .collection(collection)
          .where(collection === "auditLogs" ? "actorId" : "userId", "==", uid)
          .get();
        for (const doc of found.docs) paths.add(doc.ref.path);
      }),
    );
  }
  await Promise.all([...paths].map((path) => db.recursiveDelete(db.doc(path))));
  if (uid) await auth.deleteUser(uid);
  await db.terminate();
  await deleteApp(app);
  console.log(`Removed only the temporary auth identity and carts for ${run}.`);
}
