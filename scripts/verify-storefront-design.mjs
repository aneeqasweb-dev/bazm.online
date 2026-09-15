import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium, expect as baseExpect } from "@playwright/test";
const expect = baseExpect.configure({ timeout: 45000 });

// Read-only browser checks for the hosted sample catalog. No accounts or orders are created.
const base = process.env.STOREFRONT_TEST_BASE_URL ?? "http://127.0.0.1:3122";
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
mkdirSync("test-results/storefront", { recursive: true });
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
    await context.addInitScript(() =>
      localStorage.setItem("bazm.analytics-consent.v1", "denied"),
    );
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const [path, cards, heading] of [
      ["/", 12, "For every"],
      ["/shop", 12, "Shop Bazm"],
      ["/formal-wear", 6, "Formal Wear"],
      ["/mens-wear", 3, "Men's Wear"],
      ["/accessories", 3, "Accessories"],
      ["/product/rose-ayla-suit", 4, "Rose Ayla Suit"],
    ]) {
      const response = await page.goto(`${base}${path}`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      assert.equal(response.status(), 200, path);
      await expect(page.locator("h1")).toContainText(heading);
      await expect(page.locator(".product-card")).toHaveCount(cards);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `${path}: overflow at ${width}px`,
      );
      await page
        .locator("main img")
        .evaluateAll((images) =>
          images.forEach((img) => (img.loading = "eager")),
        );
      await expect
        .poll(
          () =>
            page
              .locator("main img")
              .evaluateAll((images) =>
                images.every((img) => img.complete && img.naturalWidth > 0),
              ),
          { timeout: 60000, message: `${path}: images loaded` },
        )
        .toBe(true);
      if (path === "/") {
        await expect(page.locator("#new-arrivals .product-card")).toHaveCount(
          8,
        );
        if (width === 390)
          assert.equal(
            await page
              .locator(".store-product-grid")
              .first()
              .evaluate(
                (el) =>
                  getComputedStyle(el).gridTemplateColumns.split(" ").length,
              ),
            2,
          );
      }
      if (path === "/product/rose-ayla-suit") {
        await page.getByRole("button", { name: "Medium", exact: true }).click();
        await expect(
          page.getByRole("button", { name: "Medium", exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
        await expect(
          page.getByRole("button", { name: "Add 1 to cart", exact: true }),
        ).toBeEnabled();
      }
      if (["/", "/shop", "/product/rose-ayla-suit"].includes(path)) {
        await page.screenshot({
          path: `test-results/storefront/${path === "/" ? "home" : path === "/shop" ? "shop" : "product"}-${width}.png`,
          fullPage: true,
        });
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
        assert.deepEqual(
          violations,
          [],
          `Accessibility on ${path} at ${width}px: ${JSON.stringify(violations)}`,
        );
      }
      checks++;
      console.log(
        `PASS ${width}px ${path}: ${cards} product cards, images loaded, no overflow`,
      );
    }
    await page.goto(`${base}/shop`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("Search the collection").fill("sage");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(page.locator(".product-card")).toHaveCount(1);
    await expect(page.locator(".product-card")).toContainText(
      "Sage Inaya Suit",
    );
    await page.getByLabel("Search the collection").fill("no-such-piece");
    await page.getByRole("button", { name: "Apply filters" }).click();
    await expect(
      page.getByText("No pieces match these filters.", { exact: false }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Clear", exact: true }).click();
    await expect(page.locator(".product-card")).toHaveCount(12);
    assert.deepEqual(errors, [], `Browser errors at ${width}px`);
    console.log(
      `PASS ${width}px search, empty results, clear filters and size selection`,
    );
    checks++;
    await context.close();
  }
  console.log(JSON.stringify({ base, checks, ok: true }));
} finally {
  await browser.close();
}
