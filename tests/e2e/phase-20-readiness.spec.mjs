import { expect, test } from "@playwright/test";

const legalRoutes = [
  ["/about", "A modern gathering of style."],
  ["/contact", "How can we help?"],
  ["/faq", "Frequently asked questions"],
  ["/shipping", "Shipping and delivery"],
  ["/returns", "Returns and refunds"],
  ["/privacy", "Privacy notice"],
  ["/terms", "Terms of use and sale"],
];

test("release health, legal routes, footer, and analytics consent are ready", async ({
  context,
  page,
}) => {
  await context.clearCookies();
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  const consent = page.getByRole("dialog", { name: "Analytics consent" });
  await expect(consent).toBeVisible();
  await expect(consent).toContainText("Analytics stays off until you accept");
  await page.getByRole("button", { name: "Decline analytics" }).click();
  await expect(consent).toBeHidden();
  await page.getByRole("button", { name: "Privacy choices" }).click();
  await expect(consent).toBeVisible();
  await page.getByRole("button", { name: "Accept analytics" }).click();
  await expect(consent).toBeHidden();

  const footer = page.getByRole("navigation", { name: "Footer navigation" });
  for (const [path] of legalRoutes) {
    await expect(footer.locator(`a[href=\"${path}\"]`)).toBeVisible();
  }

  for (const [path, heading] of legalRoutes) {
    const response = await page.goto(path);
    expect(response?.ok(), `${path} failed`).toBeTruthy();
    await expect(
      page.getByRole("heading", { level: 1, name: heading }),
    ).toBeVisible();
  }

  const health = await page.request.get("/api/health");
  await expect(health).toBeOK();
  expect(await health.json()).toEqual({ service: "bazm-web", status: "ok" });
  expect(health.headers()["cache-control"]).toContain("no-store");
});
