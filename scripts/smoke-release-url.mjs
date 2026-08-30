import assert from "node:assert/strict";

const configured = process.env.RELEASE_BASE_URL?.trim();
assert.ok(configured, "RELEASE_BASE_URL is required");
const baseUrl = new URL(configured);
assert.equal(baseUrl.protocol, "https:", "Release smoke target must use HTTPS");
assert.equal(baseUrl.pathname, "/", "Release smoke target must be an origin");
assert.equal(baseUrl.search, "", "Release smoke target must not have a query");
assert.equal(baseUrl.hash, "", "Release smoke target must not have a fragment");

const paths = [
  "/api/health",
  "/about",
  "/contact",
  "/faq",
  "/shipping",
  "/returns",
  "/privacy",
  "/terms",
  "/robots.txt",
  "/sitemap.xml",
];

for (const path of paths) {
  const response = await fetch(new URL(path, baseUrl), {
    headers: { "user-agent": "BazmReleaseSmoke/1.0" },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  assert.ok(response.ok, `${path} returned HTTP ${response.status}`);
  const body = await response.text();
  assert.ok(body.length > 0, `${path} returned an empty response`);
  assert.ok(
    !/(?:PAYMENT_WEBHOOK_SECRET|EMAIL_PROVIDER_API_KEY|PRIVATE KEY)/i.test(
      body,
    ),
    `${path} exposed server-only configuration material`,
  );
  if (path === "/api/health") {
    assert.deepEqual(JSON.parse(body), { service: "bazm-web", status: "ok" });
    assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
  }
  if (path === "/about") {
    for (const header of [
      "content-security-policy",
      "referrer-policy",
      "strict-transport-security",
      "x-content-type-options",
    ]) {
      assert.ok(response.headers.get(header), `/about is missing ${header}`);
    }
  }
}

console.log(
  JSON.stringify({
    baseUrl: baseUrl.origin,
    ok: true,
    pathsChecked: paths.length,
  }),
);
