import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";

const projectId = "demo-bazm-online";
const apiKey = "demo-api-key";
const authOrigin = "http://127.0.0.1:9099";
const functionsOrigin = `http://127.0.0.1:5001/${projectId}/asia-south1`;
const appOrigin = "http://127.0.0.1:3117";
const canonicalOrigin = "https://bazm.online";
const suffix = Date.now().toString();
const password = "Secure123";
const botHeaders = { "user-agent": "Googlebot" };
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const frontendRoot = join(repoRoot, "frontend");
const budgetsPath = join(repoRoot, "docs/performance-budgets.json");

function loadBudgets() {
  assert.ok(existsSync(budgetsPath), "Missing performance budget file");
  return JSON.parse(readFileSync(budgetsPath, "utf8"));
}

function assertBundleBudgets(budgets) {
  const statsPath = join(
    frontendRoot,
    ".next/diagnostics/route-bundle-stats.json",
  );
  assert.ok(
    existsSync(statsPath),
    "Run `npm run build --workspace frontend` before bundle budget checks.",
  );
  const stats = JSON.parse(readFileSync(statsPath, "utf8"));
  const results = [];

  for (const [route, budget] of Object.entries(budgets.routes)) {
    const routeStats = stats.find(
      (item) => item.route === budget.routeStatsKey,
    );
    assert.ok(routeStats, `Missing bundle stats for ${budget.routeStatsKey}`);

    const sizes = routeStats.firstLoadChunkPaths.reduce(
      (totals, chunkPath) => {
        const buffer = readFileSync(join(frontendRoot, chunkPath));
        return {
          gzipBytes: totals.gzipBytes + gzipSync(buffer).length,
          rawBytes: totals.rawBytes + buffer.length,
        };
      },
      { gzipBytes: 0, rawBytes: 0 },
    );

    assert.ok(
      sizes.gzipBytes <= budget.maxFirstLoadJsGzipBytes,
      `${route} first-load gzip JS ${sizes.gzipBytes} exceeded ${budget.maxFirstLoadJsGzipBytes}`,
    );
    results.push({
      chunks: routeStats.firstLoadChunkPaths.length,
      gzipBytes: sizes.gzipBytes,
      rawBytes: sizes.rawBytes,
      route,
    });
  }

  return results;
}

function walkFiles(root, predicate) {
  const found = [];
  for (const item of readdirSync(root)) {
    const absolute = join(root, item);
    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      found.push(...walkFiles(absolute, predicate));
    } else if (predicate(absolute)) {
      found.push(absolute);
    }
  }
  return found;
}

function assertImagesAreStableAndSized() {
  const files = walkFiles(join(frontendRoot, "src"), (file) =>
    /\.(tsx|ts)$/.test(file),
  );
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/<Image\b[\s\S]*?\/>/g)) {
      const tag = match[0];
      assert.ok(
        /\salt=/.test(tag),
        `${relative(repoRoot, file)} has an Image without alt text`,
      );
      if (/\sfill(?:\s|>)/.test(tag)) {
        assert.ok(
          /\ssizes=/.test(tag),
          `${relative(repoRoot, file)} has a fill Image without sizes`,
        );
      } else {
        assert.ok(
          /\sheight=/.test(tag) && /\swidth=/.test(tag),
          `${relative(repoRoot, file)} has an Image without width/height`,
        );
      }
    }
  }
}

function assertFirestoreQueriesAreBounded() {
  const files = walkFiles(join(frontendRoot, "src"), (file) =>
    /\.(tsx|ts)$/.test(file),
  );
  const offenders = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/\.get\(\)/g)) {
      const context = source.slice(Math.max(0, match.index - 800), match.index);
      const touchesCollection =
        context.includes(".collection(") ||
        context.includes(".collectionGroup(");
      if (!touchesCollection) continue;
      if (context.includes(".doc(") || context.includes(".limit(")) continue;
      offenders.push(`${relative(repoRoot, file)} near ${match.index}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "Found unbounded Firestore query get() calls",
  );
}

function assertStaticPerformancePosture() {
  const rootLayout = readFileSync(
    join(frontendRoot, "src/app/layout.tsx"),
    "utf8",
  );
  assert.ok(
    !rootLayout.includes("FirebaseBrowserIntegrations"),
    "Root layout should not load Firebase browser code on every route",
  );

  const browserIntegrations = readFileSync(
    join(
      frontendRoot,
      "src/components/providers/firebase-browser-integrations.tsx",
    ),
    "utf8",
  );
  assert.ok(
    browserIntegrations.includes(
      'import("@/lib/firebase/browser-integrations")',
    ),
    "Firebase browser integrations should be lazy-loaded",
  );

  const productDetail = readFileSync(
    join(frontendRoot, "src/components/store/product-detail.tsx"),
    "utf8",
  );
  assert.ok(
    productDetail.includes("preload"),
    "Product LCP image should use Next 16 preload",
  );
  assert.ok(
    !/\bpriority\b/.test(productDetail),
    "Product image should not use deprecated priority prop",
  );

  const nextConfig = readFileSync(join(frontendRoot, "next.config.ts"), "utf8");
  assert.ok(
    nextConfig.includes("private, no-store"),
    "Private routes must have no-store cache headers",
  );
  assert.ok(
    nextConfig.includes("qualities: [60, 70, 75, 80]"),
    "Image quality allow-list should be explicit",
  );

  const adminData = readFileSync(
    join(frontendRoot, "src/lib/admin/admin-data.ts"),
    "utf8",
  );
  assert.ok(
    adminData.includes("limit = 100"),
    "Admin dashboard sample reads should stay capped at 100 per collection",
  );

  const privateSources = [
    join(frontendRoot, "src/app/account"),
    join(frontendRoot, "src/app/admin"),
    join(frontendRoot, "src/app/cart"),
    join(frontendRoot, "src/app/checkout"),
    join(frontendRoot, "src/app/wishlist"),
    join(frontendRoot, "src/lib/admin"),
    join(frontendRoot, "src/lib/orders"),
    join(frontendRoot, "src/lib/reviews"),
    join(frontendRoot, "src/lib/returns"),
  ];
  for (const root of privateSources.filter(existsSync)) {
    for (const file of walkFiles(root, (item) => /\.(tsx|ts)$/.test(item))) {
      assert.ok(
        !readFileSync(file, "utf8").includes("unstable_cache"),
        `${relative(repoRoot, file)} must not persist-cache private data`,
      );
    }
  }

  assertImagesAreStableAndSized();
  assertFirestoreQueriesAreBounded();
}

if (process.argv.includes("--bundle-only")) {
  const results = assertBundleBudgets(loadBudgets());
  console.table(results);
  process.exit(0);
}

const app = getApps()[0] ?? initializeApp({ projectId });
const auth = getAuth(app);
const firestore = getFirestore(app);

async function authRequest(endpoint, body) {
  const response = await fetch(
    `${authOrigin}/identitytoolkit.googleapis.com/v1/${endpoint}?key=${apiKey}`,
    {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  return { data: await response.json(), response };
}

async function refreshToken(refreshToken) {
  const response = await fetch(
    `${authOrigin}/securetoken.googleapis.com/v1/token?key=${apiKey}`,
    {
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    },
  );
  const data = await response.json();
  assert.ok(response.ok && data.id_token, "Token refresh failed");
  return data.id_token;
}

async function callFunction(name, idToken, data = {}) {
  const response = await fetch(`${functionsOrigin}/${name}`, {
    body: JSON.stringify({ data }),
    headers: {
      authorization: `Bearer ${idToken}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  return { data: await response.json(), response };
}

async function account(role, label, permissions = []) {
  const signup = await authRequest("accounts:signUp", {
    email: `phase-17-${label}-${suffix}@example.test`,
    password,
    returnSecureToken: true,
  });
  assert.ok(signup.response.ok && signup.data.idToken && signup.data.localId);
  const registration = await callFunction(
    "completeRegistration",
    signup.data.idToken,
    {
      name: `Phase Seventeen ${label}`,
    },
  );
  assert.ok(registration.response.ok, `${label} registration failed`);
  await Promise.all([
    auth.updateUser(signup.data.localId, { emailVerified: true }),
    firestore.collection("users").doc(signup.data.localId).set(
      {
        emailVerified: true,
        isActive: true,
        permissions,
        role,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    ),
  ]);
  await auth.setCustomUserClaims(signup.data.localId, {
    claimsVersion: 1,
    isActive: true,
    permissions,
    role,
  });
  return {
    token: await refreshToken(signup.data.refreshToken),
    uid: signup.data.localId,
  };
}

function storageUrl(path) {
  return `http://127.0.0.1:9199/v0/b/${projectId}.appspot.com/o/${encodeURIComponent(
    path,
  )}?alt=media`;
}

function mediaAsset(path, alt) {
  return {
    alt,
    contentHash: `phase17hash${suffix}${path.length}`,
    contentType: "image/webp",
    height: 1500,
    path,
    sortOrder: 0,
    url: storageUrl(path),
    width: 1200,
  };
}

function stamp(now = Timestamp.now()) {
  return {
    createdAt: now,
    schemaVersion: 1,
    updatedAt: now,
  };
}

async function registerSlug(type, slug, ownerId, now) {
  await firestore
    .collection("slugRegistry")
    .doc(`${type.toLowerCase()}_${slug}`)
    .set({
      createdAt: now,
      ownerId,
      slug,
      type,
    });
}

async function seedCatalog() {
  const now = Timestamp.now();
  const categoryId = `p17-category-${suffix}`;
  const productId = `p17-product-${suffix}`;
  const variantId = `p17-variant-${suffix}`;
  const categorySlug = `phase-seventeen-edit-${suffix}`;
  const productSlug = `phase-seventeen-kurta-${suffix}`;

  await firestore
    .collection("categories")
    .doc(categoryId)
    .set({
      archivedAt: null,
      depth: 0,
      image: mediaAsset(
        `categories/phase-17-${suffix}/edit.webp`,
        "Phase seventeen performance category",
      ),
      name: "Phase Seventeen Edit",
      parentId: null,
      seo: {
        description:
          "Phase Seventeen category used to validate route performance budgets.",
        title: "Phase Seventeen Edit",
      },
      slug: categorySlug,
      sortOrder: 0,
      status: "ACTIVE",
      ...stamp(now),
    });
  await registerSlug("CATEGORY", categorySlug, categoryId, now);

  await firestore
    .collection("products")
    .doc(productId)
    .set({
      archivedAt: null,
      basePrice: { amountMinor: 175_000, currency: "PKR" },
      brand: "Bazm",
      categoryId,
      categoryPath: [categoryId],
      description:
        "A Phase Seventeen performance product used to verify route response, image preload, and bundle budget behavior.",
      flags: { featured: true, newArrival: true },
      media: [
        mediaAsset(
          `products/phase-17-${suffix}/primary.webp`,
          "Phase seventeen performance kurta",
        ),
      ],
      name: "Phase Seventeen Performance Kurta",
      publishedAt: now,
      ratingSummary: { average: 4.8, count: 3 },
      searchTokens: ["phase", "seventeen", "performance", "kurta", "bazm"],
      seo: {
        description:
          "Shop the Phase Seventeen Performance Kurta at Bazm with verified performance budgets.",
        title: "Phase Seventeen Performance Kurta",
      },
      slug: productSlug,
      status: "PUBLISHED",
      tags: ["phase-seventeen", "kurta"],
      ...stamp(now),
    });
  await firestore
    .collection("products")
    .doc(productId)
    .collection("variants")
    .doc(variantId)
    .set({
      color: "Ivory",
      isActive: true,
      media: [],
      priceOverride: null,
      productId,
      size: "M",
      sku: `P17-SKU-${suffix}`,
      ...stamp(now),
    });
  await registerSlug("PRODUCT", productSlug, productId, now);

  return {
    categoryPath: `/${categorySlug}`,
    productPath: `/product/${productSlug}`,
  };
}

async function waitForNextServer(server) {
  let serverOutput = "";
  server.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${appOrigin}/shop`, {
        headers: botHeaders,
      });
      if (response.ok) return;
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Next.js server did not start. ${serverOutput}`);
}

async function stopNextServer(server) {
  const stopped = new Promise((resolve) => server.once("exit", resolve));
  server.kill("SIGTERM");
  await Promise.race([
    stopped,
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (server.exitCode === null && server.signalCode === null) {
    server.kill("SIGKILL");
    await stopped;
  }
}

async function createSession(idToken) {
  const response = await fetch(`${appOrigin}/api/auth/session`, {
    body: JSON.stringify({ idToken }),
    headers: { "content-type": "application/json", origin: appOrigin },
    method: "POST",
  });
  const sessionCookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(response.ok && sessionCookie, "Web session failed");
  assert.match(
    response.headers.get("cache-control") ?? "",
    /private.*no-store/i,
    "Session route must not be shared-cacheable",
  );
  return sessionCookie;
}

async function measuredFetch(path, options = {}) {
  const attempts = [];
  for (let index = 0; index < 2; index += 1) {
    const started = performance.now();
    const response = await fetch(`${appOrigin}${path}`, {
      headers: {
        ...botHeaders,
        ...(options.cookie ? { cookie: options.cookie } : {}),
      },
      redirect: "manual",
    });
    const html = await response.text();
    attempts.push({
      cacheControl: response.headers.get("cache-control") ?? "",
      durationMs: performance.now() - started,
      html,
      status: response.status,
    });
  }
  return attempts.sort((left, right) => left.durationMs - right.durationMs)[0];
}

function assertRouteWithinBudget(routeKey, result, budgets) {
  const budget = budgets.routes[routeKey];
  assert.ok(budget, `Missing budget for ${routeKey}`);
  assert.ok(
    result.status >= 200 && result.status < 300,
    `${routeKey} returned ${result.status}`,
  );
  assert.ok(
    result.html.length <= budget.maxHtmlBytes,
    `${routeKey} HTML ${result.html.length} exceeded ${budget.maxHtmlBytes}`,
  );
  assert.ok(
    result.durationMs <= budget.maxResponseMs,
    `${routeKey} response ${result.durationMs.toFixed(0)}ms exceeded ${budget.maxResponseMs}ms`,
  );
}

function assertPrivateNoStore(routeKey, result) {
  assert.match(
    result.cacheControl,
    /private.*no-store/i,
    `${routeKey} should send private no-store cache headers`,
  );
}

try {
  const budgets = loadBudgets();
  const bundleResults = assertBundleBudgets(budgets);
  assertStaticPerformancePosture();

  const [customer, admin, routes] = await Promise.all([
    account("CUSTOMER", "customer"),
    account("ADMIN", "admin"),
    seedCatalog(),
  ]);

  const nextServer = spawn(
    process.execPath,
    [
      fileURLToPath(
        new URL("../node_modules/next/dist/bin/next", import.meta.url),
      ),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3117",
    ],
    {
      cwd: frontendRoot,
      env: {
        ...process.env,
        NEXT_PUBLIC_APP_URL: canonicalOrigin,
        NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  try {
    await waitForNextServer(nextServer);
    const [customerCookie, adminCookie] = await Promise.all([
      createSession(customer.token),
      createSession(admin.token),
    ]);

    const routeResults = {
      "/": await measuredFetch("/"),
      "/admin": await measuredFetch("/admin", { cookie: adminCookie }),
      "/cart": await measuredFetch("/cart", { cookie: customerCookie }),
      "/checkout": await measuredFetch("/checkout", {
        cookie: customerCookie,
      }),
      "/product/[slug]": await measuredFetch(routes.productPath),
      "/shop": await measuredFetch("/shop?q=performance"),
      "/[...categoryPath]": await measuredFetch(routes.categoryPath),
    };

    for (const [routeKey, result] of Object.entries(routeResults)) {
      assertRouteWithinBudget(routeKey, result, budgets);
    }
    for (const privateRoute of ["/admin", "/cart", "/checkout"]) {
      assertPrivateNoStore(privateRoute, routeResults[privateRoute]);
    }

    const productHtml = routeResults["/product/[slug]"].html;
    assert.ok(
      /rel="preload"[^>]+as="image"/i.test(productHtml) ||
        /fetchpriority="high"/i.test(productHtml),
      "Product LCP image should be preloaded or high priority in rendered HTML",
    );
    assert.ok(
      !routeResults["/"].html.includes("firebaseapp.com") &&
        !routeResults["/shop"].html.includes("firebaseapp.com"),
      "Anonymous public pages should not eagerly initialize Firebase browser integrations",
    );

    const sitemap = await measuredFetch("/sitemap.xml");
    assert.match(
      sitemap.cacheControl,
      /public.*max-age=300/i,
      "Sitemap should send a short public cache header",
    );

    console.table(
      bundleResults.map((result) => ({
        chunks: result.chunks,
        gzipKB: Math.round(result.gzipBytes / 1024),
        route: result.route,
      })),
    );
  } finally {
    await stopNextServer(nextServer);
  }

  console.log(
    "Phase 17 performance flow passed budgets, bundle checks, private cache safety, image posture, and bounded-read audits.",
  );
} finally {
  await deleteApp(app).catch(() => undefined);
}
