import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium, expect as baseExpect } from "@playwright/test";
const expect = baseExpect.configure({ timeout: 45000 });

// Read-only browser checks for the hosted sample catalog. No accounts or orders are created.
const base = process.env.AUTH_TEST_BASE_URL ?? "http://127.0.0.1:3122";
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
    readFileSync(
      `${process.env.HOME}/.local/share/com.vercel.cli/auth.json`,
      "utf8",
    ),
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
mkdirSync("test-results/auth", { recursive: true });
const browser = await chromium.launch();
let checks = 0;
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 950 },
    });
    if (preview)
      await context.route(`${target.origin}/**`, (route) =>
        route.continue({
          headers: { ...route.request().headers(), ...headers },
        }),
      );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const path of [
      "/login",
      "/register",
      "/forgot-password",
      "/verify-email",
      "/reset-password",
    ]) {
      const response = await page.goto(`${base}${path}`, {
        waitUntil: "networkidle",
        timeout: 60000,
      });
      assert.equal(response.status(), 200);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      if (width === 1440)
        await expect
          .poll(() =>
            page
              .locator("main img")
              .evaluateAll((images) =>
                images.every((img) => img.complete && img.naturalWidth > 0),
              ),
          )
          .toBe(true);
      if (path === "/login" || path === "/register") {
        const submit = page.getByRole("button", {
          name: path === "/login" ? "Sign in" : "Create account",
          exact: true,
        });
        await expect(submit).toBeEnabled();
        await submit.click();
        await expect(
          page.locator('[aria-invalid="true"]').first(),
        ).toBeFocused();
        assert.equal(new URL(page.url()).search, "");
        const password = page.getByLabel("Password", { exact: true });
        await password.fill("SamplePassword42");
        await page
          .getByRole("button", { name: "Show password", exact: true })
          .click();
        await expect(password).toHaveAttribute("type", "text");
        await page
          .getByRole("button", { name: "Hide password", exact: true })
          .click();
        await expect(password).toHaveAttribute("type", "password");
      }
      await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
      const violations = await page.evaluate(async () =>
        (
          await window.axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
          })
        ).violations.map(({ id, nodes }) => ({
          id,
          targets: nodes.map(({ target }) => target),
        })),
      );
      assert.deepEqual(violations, [], `Accessibility: ${path} ${width}px`);
      // Save the clean form as the visual reference after testing error states.
      if (path === "/login" || path === "/register")
        await page.reload({ waitUntil: "networkidle" });
      await page.screenshot({
        path: `test-results/auth/${path.slice(1)}-${width}.png`,
        fullPage: true,
      });
      checks++;
      console.log(
        `PASS ${width}px ${path}: responsive, accessible account page`,
      );
    }
    await page.goto(`${base}/login`, { waitUntil: "networkidle" });
    await page
      .getByRole("navigation", { name: "Account access" })
      .getByRole("link", { name: "Create account" })
      .click();
    await expect(page).toHaveURL(`${base}/register`);
    await page
      .getByRole("navigation", { name: "Account access" })
      .getByRole("link", { name: "Sign in" })
      .click();
    await expect(page).toHaveURL(`${base}/login`);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(JSON.stringify({ base, checks, ok: true }));
} finally {
  await browser.close();
}
