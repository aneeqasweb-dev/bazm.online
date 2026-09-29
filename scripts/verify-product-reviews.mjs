import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { parseEnv } from "node:util";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
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
const base = process.env.REVIEWS_TEST_BASE_URL ?? "http://127.0.0.1:3000";
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
  const r = await fetch(
    "https://api.vercel.com/v9/projects/prj_EJaOUvs2AYTbScUisKkW1cNTwEbM",
    { headers: { Authorization: `Bearer ${token}` } },
  );
  assert.ok(r.ok);
  const project = await r.json();
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
const db = getFirestore(app),
  auth = getAuth(app);
const run = `qa-reviews-${Date.now()}-${randomBytes(3).toString("hex")}`;
const stamp = {
  schemaVersion: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const paths = new Set([`products/${run}`, `slugRegistry/product_${run}`]);
let browser, page, user;
mkdirSync("test-results/product-reviews", { recursive: true });
try {
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addInitScript(() =>
    localStorage.setItem("bazm.analytics-consent.v1", "denied"),
  );
  if (preview)
    await context.route(`${target.origin}/**`, (route) =>
      route.continue({ headers: { ...route.request().headers(), ...headers } }),
    );
  page = await context.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Inspect the customer-facing empty state on an existing sample product.
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${base}/product/ivory-meher-top-handle-bag#reviews`, {
      waitUntil: "networkidle",
      timeout: 60000,
    });
    const section = page.locator("#reviews");
    await expect(
      section.getByRole("heading", { name: "Customer Reviews", exact: true }),
    ).toBeVisible();
    await expect(
      section.getByRole("link", { name: "Write a review", exact: true }),
    ).toHaveAttribute("href", "/product/ivory-meher-top-handle-bag/review");
    await expect(
      section.getByRole("combobox", { name: "Sort reviews" }),
    ).toBeEnabled();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
    const violations = await page.evaluate(async () =>
      (
        await window.axe.run("#reviews", {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
        })
      ).violations.map(({ id, nodes }) => ({
        id,
        targets: nodes.map((x) => x.target),
      })),
    );
    assert.deepEqual(violations, []);
    await section.screenshot({
      path: `test-results/product-reviews/empty-${width}.png`,
    });
    await section
      .getByRole("button", { name: "Ask a question", exact: true })
      .click();
    await expect(
      section.getByRole("link", {
        name: "Sign in to ask a question",
        exact: true,
      }),
    ).toBeVisible();
    await section
      .getByRole("tab", { name: "Questions", exact: true })
      .press("ArrowLeft");
    await expect(
      section.getByRole("tab", { name: /Reviews \(/ }),
    ).toBeFocused();
    console.log(
      `PASS ${width}px: review summary, actions, questions, keyboard tabs, responsive layout and accessibility`,
    );
  }
  const source = (
    await db.doc("products/demo-ivory-meher-top-handle-bag").get()
  ).data();
  assert.equal(source.status, "PUBLISHED");
  await db.doc(`products/${run}`).create({
    ...source,
    name: "QA Review Test Fixture",
    slug: run,
    flags: { featured: false, newArrival: false },
    ...stamp,
  });
  await db.doc(`products/${run}/variants/qa-ivory`).create({
    productId: run,
    sku: run.toUpperCase(),
    color: "Ivory",
    size: "One Size",
    priceOverride: null,
    media: [],
    isActive: true,
    ...stamp,
  });
  await db.doc(`slugRegistry/product_${run}`).create({ ownerId: run });
  const ratings = [2, 5, 1, 4, 5, 3, 4, 5, 2, 5, 3, 4];
  const batch = db.batch();
  for (let i = 0; i < 15; i++) {
    const id = `${run}-${i}`;
    paths.add(`reviews/${id}`);
    batch.create(db.doc(`reviews/${id}`), {
      productId: run,
      orderId: `${run}-order`,
      variantId: "qa-ivory",
      userId: run,
      authorName: "QA Sample Reviewer",
      rating: ratings[i] ?? 5,
      title: `QA Review ${String(i).padStart(2, "0")}`,
      content:
        "Temporary automated review fixture for sorting and pagination verification.",
      status: i < 12 ? "PUBLISHED" : ["PENDING", "HIDDEN", "REJECTED"][i - 12],
      verifiedPurchase: true,
      images: [],
      moderationReason: null,
      archivedAt: null,
      ...stamp,
      createdAt: new Date(Date.UTC(2026, 0, 1, i)),
    });
  }
  await batch.commit();
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [sort, compare] of [
    ["recent", (a, b) => b - a],
    ["highest", (a, b) => ratings[b] - ratings[a] || b - a],
    ["lowest", (a, b) => ratings[a] - ratings[b] || b - a],
  ]) {
    await page.goto(`${base}/product/${run}?reviewSort=${sort}#reviews`, {
      waitUntil: "networkidle",
    });
    const expected = ratings
      .map((_, index) => index)
      .sort(compare)
      .map((i) => `QA Review ${String(i).padStart(2, "0")}`);
    const found = [];
    while (true) {
      assert.ok(found.length < 15, "Review pagination repeated a page.");
      await expect(page.locator("#reviews")).toContainText(
        "Based on 12 reviews",
      );
      await expect(
        page.locator('[aria-label="5 stars: 4 reviews"]'),
      ).toBeVisible();
      found.push(
        ...(await page.locator("#reviews article h3").allTextContents()),
      );
      const next = page.getByRole("link", {
        name: "Next reviews page →",
        exact: true,
      });
      if (!(await next.count())) break;
      const destination = new URL(await next.getAttribute("href"), base).href;
      await next.click();
      await expect(page).toHaveURL(destination);
      await expect(page.locator("#reviews article h3").first()).toHaveText(
        expected[found.length],
      );
      await page.waitForLoadState("networkidle");
    }
    assert.deepEqual(found, expected);
    console.log(
      `PASS ${sort}: all 12 published reviews, stable pagination, complete rating counts, private moderation states excluded`,
    );
  }
  // Check switching sort from a later page clears its cursor.
  await page
    .getByRole("combobox", { name: "Sort reviews" })
    .selectOption("highest");
  await expect(page).toHaveURL(
    `${base}/product/${run}?reviewSort=highest#reviews`,
  );
  await expect(page.locator("#reviews article")).toHaveCount(5);
  await page
    .locator("#reviews")
    .screenshot({ path: "test-results/product-reviews/populated-1440.png" });
  const email = `${run}@example.test`,
    password = `QA1!${randomBytes(12).toString("hex")}`;
  user = await auth.createUser({ email, password, emailVerified: true });
  paths.add(`users/${user.uid}`);
  await db.doc(`users/${user.uid}`).create({
    name: "QA Review Shopper",
    email,
    phone: null,
    avatarUrl: null,
    avatarPath: null,
    role: "CUSTOMER",
    isActive: true,
    emailVerified: true,
    ...stamp,
  });
  await auth.setCustomUserClaims(user.uid, {
    role: "CUSTOMER",
    isActive: true,
    claimsVersion: 1,
  });
  const next = `/product/${run}?reviewTab=questions#reviews`;
  await page.goto(`${base}/login?${new URLSearchParams({ next })}`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(`${base}${next}`);
  await page.setViewportSize({ width: 390, height: 1000 });
  await expect(
    page.getByRole("tab", { name: "Questions", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page
    .getByLabel("Your question", { exact: true })
    .fill("Does this bag have an adjustable shoulder strap?");
  await page
    .getByRole("button", { name: "Send question", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Your question has been sent",
      exact: true,
    }),
  ).toBeVisible();
  const tickets = await db
    .collection("supportTickets")
    .where("userId", "==", user.uid)
    .get();
  assert.equal(tickets.size, 1);
  assert.ok(tickets.docs[0].get("initialMessage").includes(`/product/${run}`));
  assert.ok(
    tickets.docs[0].get("initialMessage").includes("adjustable shoulder strap"),
  );
  await page
    .getByRole("link", { name: "View my question →", exact: true })
    .click();
  await expect(page.locator("#support-requests")).toContainText(
    "Product question: QA Review Test Fixture",
  );
  console.log(
    "PASS actual signed-in product question: database persistence, product context, success and account support conversation",
  );
  assert.deepEqual(errors, []);
} catch (error) {
  if (page)
    await page.screenshot({
      path: "test-results/product-reviews/failure.png",
      fullPage: true,
    });
  throw error;
} finally {
  await browser?.close();
  if (user) {
    for (const [collection, field] of [
      ["supportTickets", "userId"],
      ["customerActivities", "userId"],
      ["auditLogs", "actorId"],
    ]) {
      const snapshot = await db
        .collection(collection)
        .where(field, "==", user.uid)
        .get();
      for (const doc of snapshot.docs) paths.add(doc.ref.path);
    }
    await auth.deleteUser(user.uid);
  }
  await Promise.all([...paths].map((path) => db.recursiveDelete(db.doc(path))));
  await db.terminate();
  await deleteApp(app);
  console.log("Removed only temporary review fixtures and the test customer.");
}
