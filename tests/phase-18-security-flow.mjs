import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const projectId = "demo-bazm-online";
const apiKey = "demo-api-key";
const authOrigin = "http://127.0.0.1:9099";
const functionsOrigin = `http://127.0.0.1:5001/${projectId}/asia-south1`;
const appOrigin = "http://127.0.0.1:3118";
const suffix = Date.now().toString();
const password = "Secure123";
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const frontendRoot = join(repoRoot, "frontend");
const functionsRoot = join(repoRoot, "functions/src");
const allowedFrontendServerEnv = new Set([
  "FIREBASE_AUTH_EMULATOR_HOST",
  "FIRESTORE_EMULATOR_HOST",
  "NODE_ENV",
  "VERCEL_ENV",
]);

function walkFiles(root, predicate) {
  if (!existsSync(root)) return [];
  const found = [];
  for (const item of readdirSync(root)) {
    if ([".git", ".next", "lib", "node_modules"].includes(item)) continue;
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

function sourceFiles(root) {
  return walkFiles(root, (file) =>
    /\.(mjs|ts|tsx|js|json|md|rules)$/.test(file),
  );
}

function read(relativePath) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function relativePath(file) {
  return relative(repoRoot, file).replaceAll("\\", "/");
}

function assertStaticSecurityPosture() {
  const nextConfig = read("frontend/next.config.ts");
  for (const header of [
    "Content-Security-Policy",
    "Cross-Origin-Opener-Policy",
    "Permissions-Policy",
    "Referrer-Policy",
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "X-Frame-Options",
  ]) {
    assert.ok(nextConfig.includes(header), `Missing ${header} header`);
  }
  for (const directive of [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "connect-src",
  ]) {
    assert.ok(nextConfig.includes(directive), `CSP is missing ${directive}`);
  }
  assert.ok(
    nextConfig.includes('source: "/:path*"'),
    "Security headers must apply globally",
  );
  assert.ok(
    nextConfig.includes("usesFirebaseEmulators") &&
      nextConfig.includes("emulatorConnectSources"),
    "Localhost CSP allowances must be gated by explicit emulator mode",
  );

  const adminPermissions = read("functions/src/auth/admin-permissions.ts");
  assert.ok(
    adminPermissions.includes("CURRENT_CLAIMS_VERSION") &&
      adminPermissions.includes("claimsVersion === CURRENT_CLAIMS_VERSION"),
    "Callable auth guard must enforce current claim versions",
  );
  assert.ok(
    adminPermissions.includes('profile.get("isActive") !== true'),
    "Callable auth guard must confirm server-side profile activity",
  );

  const sessionRoute = read("frontend/src/app/api/auth/session/route.ts");
  assert.ok(
    sessionRoute.includes("CURRENT_CLAIMS_VERSION"),
    "Session API must reject stale claim versions",
  );
  assert.ok(
    sessionRoute.includes("isTrustedOrigin") &&
      sessionRoute.includes("SameSite=Lax") &&
      sessionRoute.includes("HttpOnly") &&
      sessionRoute.includes("Priority=High"),
    "Session API must keep CSRF and secure cookie controls",
  );

  for (const rulesPath of [
    "firebase/firestore.rules",
    "firebase/storage.rules",
  ]) {
    const rules = read(rulesPath);
    assert.ok(
      rules.includes("request.auth.token.claimsVersion == 1"),
      `${rulesPath} must reject stale claim versions`,
    );
    assert.ok(
      rules.includes("request.auth.token.isActive == true"),
      `${rulesPath} must reject inactive accounts`,
    );
  }

  const paymentFunction = read("functions/src/payments/payment.ts");
  assert.ok(
    paymentFunction.includes("timingSafeEqual") &&
      paymentFunction.includes("request.rawBody") &&
      paymentFunction.includes("invalid_signature"),
    "Payment webhooks must verify raw-body HMAC signatures",
  );
  assert.ok(
    paymentFunction.includes("security.webhook.rejected"),
    "Webhook security failures must emit structured logs",
  );
  const paymentService = read("functions/src/payments/payment-service.ts");
  for (const expected of [
    "paymentWebhookEvents",
    "refundWebhookEvents",
    "Webhook event is stale",
    "refund-initiate",
    "refund-complete",
  ]) {
    assert.ok(
      paymentService.includes(expected),
      `Payment service is missing ${expected}`,
    );
  }

  for (const file of sourceFiles(functionsRoot).filter((item) =>
    readFileSync(item, "utf8").includes("onCall("),
  )) {
    assert.ok(
      readFileSync(file, "utf8").includes(
        'enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true"',
      ),
      `${relativePath(file)} onCall export must enforce App Check outside emulators`,
    );
  }

  const jsonLd = read("frontend/src/components/seo/json-ld.tsx");
  assert.ok(
    jsonLd.includes('replace(/</g, "\\\\u003c")'),
    "JSON-LD output must escape '<' to prevent script break-out",
  );
  for (const file of sourceFiles(join(frontendRoot, "src"))) {
    const source = readFileSync(file, "utf8");
    const path = relativePath(file);
    if (source.includes("dangerouslySetInnerHTML")) {
      assert.equal(
        path,
        "frontend/src/components/seo/json-ld.tsx",
        `${path} uses dangerouslySetInnerHTML outside the JSON-LD component`,
      );
    }
    assert.ok(!/\beval\s*\(/.test(source), `${path} uses eval()`);
    assert.ok(
      !/\bnew Function\s*\(/.test(source),
      `${path} uses new Function()`,
    );
    assert.ok(!/\.innerHTML\s*=/.test(source), `${path} assigns innerHTML`);

    for (const match of source.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
      const key = match[1];
      assert.ok(
        key.startsWith("NEXT_PUBLIC_") || allowedFrontendServerEnv.has(key),
        `${path} references non-public environment variable ${key}`,
      );
    }
  }

  const secretPatterns = [
    {
      name: "private key",
      pattern: /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,
    },
    { name: "OpenAI key", pattern: /sk-[A-Za-z0-9_-]{20,}/ },
    { name: "GitHub token", pattern: /gh[pousr]_[A-Za-z0-9_]{20,}/ },
    { name: "Slack token", pattern: /xox[baprs]-[A-Za-z0-9-]{20,}/ },
    { name: "Stripe live key", pattern: /[rs]k_live_[A-Za-z0-9]{20,}/ },
  ];
  const scanRoots = [
    "docs",
    "firebase",
    "frontend/src",
    "functions/src",
    "tests",
  ];
  const secretFindings = [];
  for (const root of scanRoots.flatMap((item) =>
    sourceFiles(join(repoRoot, item)),
  )) {
    const source = readFileSync(root, "utf8");
    for (const { name, pattern } of secretPatterns) {
      if (pattern.test(source)) {
        secretFindings.push(`${relativePath(root)} matched ${name}`);
      }
    }
  }
  assert.deepEqual(secretFindings, [], "Potential committed secrets found");
}

if (process.argv.includes("--static-only")) {
  assertStaticSecurityPosture();
  console.log("Phase 18 static security posture checks passed.");
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
  const headers = { "content-type": "application/json" };
  if (idToken) headers.authorization = `Bearer ${idToken}`;
  const response = await fetch(`${functionsOrigin}/${name}`, {
    body: JSON.stringify({ data }),
    headers,
    method: "POST",
  });
  return { data: await response.json(), response };
}

async function account({
  claimsVersion = 1,
  isActive = true,
  label,
  permissions = [],
  role,
}) {
  const signup = await authRequest("accounts:signUp", {
    email: `phase18-${label}-${suffix}@example.test`,
    password,
    returnSecureToken: true,
  });
  assert.ok(signup.response.ok && signup.data.idToken && signup.data.localId);
  const registration = await callFunction(
    "completeRegistration",
    signup.data.idToken,
    { name: `Phase Eighteen ${label}` },
  );
  assert.ok(registration.response.ok, `${label} registration failed`);
  await Promise.all([
    auth.updateUser(signup.data.localId, {
      disabled: !isActive,
      emailVerified: true,
    }),
    firestore.collection("users").doc(signup.data.localId).set(
      {
        emailVerified: true,
        isActive,
        permissions,
        role,
        updatedAt: Timestamp.now(),
      },
      { merge: true },
    ),
  ]);
  await auth.setCustomUserClaims(signup.data.localId, {
    claimsVersion,
    isActive,
    ...(permissions.length ? { permissions } : {}),
    role,
  });
  return {
    refreshToken: signup.data.refreshToken,
    token: await refreshToken(signup.data.refreshToken),
    uid: signup.data.localId,
  };
}

function assertDenied(result, label) {
  assert.ok(!result.response.ok, `${label} unexpectedly succeeded`);
  const serialized = JSON.stringify(result.data).toLowerCase();
  assert.ok(
    !/(password|refresh[_-]?token|id[_-]?token|authorization|cookie|secret|cvv)/i.test(
      serialized,
    ),
    `${label} returned sensitive error material: ${serialized}`,
  );
}

async function assertUserRole(uid, expectedRole) {
  const [profile, user] = await Promise.all([
    firestore.collection("users").doc(uid).get(),
    auth.getUser(uid),
  ]);
  assert.equal(profile.get("role"), expectedRole, "Profile role changed");
  assert.equal(
    user.customClaims?.role,
    expectedRole,
    "Auth custom claim role changed",
  );
}

async function verifyCallableAttackMatrix(accounts) {
  const { admin, staleAdmin, staleCustomer, target } = accounts;
  const unauthenticatedAdmin = await callFunction("createCoupon", null, {});
  assertDenied(unauthenticatedAdmin, "Unauthenticated admin callable");

  const staleWishlist = await callFunction(
    "addWishlistItem",
    staleCustomer.token,
    { productId: `missing-product-${suffix}` },
  );
  assertDenied(staleWishlist, "Stale customer callable");

  const staleAccess = await callFunction("updateUserAccess", staleAdmin.token, {
    isActive: true,
    permissions: ["orders.manage"],
    role: "STAFF",
    userId: target.uid,
  });
  assertDenied(staleAccess, "Stale admin access update");
  await assertUserRole(target.uid, "CUSTOMER");

  const grantAdmin = await callFunction("updateUserAccess", admin.token, {
    isActive: true,
    permissions: [],
    role: "ADMIN",
    userId: target.uid,
  });
  assertDenied(grantAdmin, "Non-super-admin administrator grant");
  await assertUserRole(target.uid, "CUSTOMER");

  const disableTarget = await callFunction("updateUserAccess", admin.token, {
    isActive: false,
    permissions: [],
    role: "CUSTOMER",
    userId: target.uid,
  });
  assert.ok(disableTarget.response.ok, "Admin could not disable target user");

  const oldTokenAfterDisable = await callFunction(
    "createSupportTicket",
    target.token,
    {
      initialMessage:
        "This old token should be denied because the server profile is disabled.",
      relatedOrderId: null,
      subject: "Disabled account token",
    },
  );
  assertDenied(oldTokenAfterDisable, "Disabled profile with old token");

  const invalidReset = await callFunction("requestPasswordResetEmail", null, {
    email: "not-an-email",
  });
  assertDenied(invalidReset, "Invalid public password-reset payload");
  const unknownReset = await callFunction("requestPasswordResetEmail", null, {
    email: `unknown-${suffix}@example.test`,
  });
  assert.ok(
    unknownReset.response.ok && unknownReset.data.result?.accepted === true,
    "Unknown password reset should be accepted without enumeration",
  );
}

function stamp(now = Timestamp.now()) {
  return {
    createdAt: now,
    schemaVersion: 1,
    updatedAt: now,
  };
}

async function seedPayment(userId) {
  const orderId = `phase18-order-${suffix}`;
  const paymentId = `phase18-payment-${suffix}`;
  const total = { amountMinor: 5000, currency: "PKR" };
  const address = {
    area: "Gulberg",
    city: "Lahore",
    deliveryInstructions: null,
    line1: "42 Bazaar Road",
    line2: null,
    phone: "+923001234567",
    postalCode: "54000",
    province: "PUNJAB",
    recipientName: "Phase Eighteen Customer",
  };
  await firestore
    .collection("orders")
    .doc(orderId)
    .create({
      adminNote: null,
      archivedAt: null,
      billingAddress: address,
      checkoutIdempotencyKey: `phase18checkout${suffix}`,
      couponCode: null,
      couponId: null,
      customerNote: null,
      deliveryMethod: "STANDARD",
      items: [
        {
          color: "Black",
          discountAmount: { amountMinor: 0, currency: "PKR" },
          lineTotal: total,
          media: null,
          productId: `phase18-product-${suffix}`,
          productName: "Phase Eighteen Security Product",
          quantity: 1,
          size: "M",
          sku: `P18-SKU-${suffix}`,
          taxAmount: { amountMinor: 0, currency: "PKR" },
          unitPrice: total,
          variantId: `phase18-variant-${suffix}`,
        },
      ],
      paymentId,
      paymentMethod: "CARD",
      placedAt: Timestamp.now(),
      policyVersion: "2026-08",
      reservationId: null,
      shippingAddress: address,
      status: "PENDING_PAYMENT",
      totals: {
        currency: "PKR",
        discount: { amountMinor: 0, currency: "PKR" },
        grandTotal: total,
        shipping: { amountMinor: 0, currency: "PKR" },
        subtotal: total,
        tax: { amountMinor: 0, currency: "PKR" },
      },
      trackingNumber: null,
      userId,
      ...stamp(),
    });
  await firestore
    .collection("payments")
    .doc(paymentId)
    .create({
      amount: total,
      failureCode: null,
      idempotencyKey: `payment_${userId}_${suffix}`,
      orderId,
      paidAt: null,
      provider: "SANDBOX",
      providerEventIds: [],
      providerPaymentId: null,
      refundedAmount: { amountMinor: 0, currency: "PKR" },
      status: "PENDING",
      userId,
      ...stamp(),
    });
  return { orderId, paymentId, total };
}

async function webhook(name, payload, signature = true) {
  const body = JSON.stringify(payload);
  const response = await fetch(`${functionsOrigin}/${name}`, {
    body,
    headers: {
      "content-type": "application/json",
      "x-bazm-signature": signature
        ? createHmac("sha256", "emulator-payment-secret")
            .update(body)
            .digest("hex")
        : "0".repeat(64),
    },
    method: "POST",
  });
  return { data: await response.json(), response };
}

async function paymentStatus(paymentId) {
  return (await firestore.collection("payments").doc(paymentId).get()).get(
    "status",
  );
}

async function refundStatus(refundId) {
  return (await firestore.collection("refunds").doc(refundId).get()).get(
    "status",
  );
}

async function verifyWebhookAttacks(accounts) {
  const payment = await seedPayment(accounts.customer.uid);
  const event = {
    amountMinor: payment.total.amountMinor,
    currency: payment.total.currency,
    eventId: `phase18-payment-event-${suffix}`,
    occurredAt: new Date().toISOString(),
    paymentId: payment.paymentId,
    providerPaymentId: `sandbox-phase18-${suffix}`,
    status: "PAID",
  };

  const forged = await webhook("paymentWebhook", event, false);
  assert.equal(forged.response.status, 401, "Forged payment webhook accepted");
  assert.equal(await paymentStatus(payment.paymentId), "PENDING");

  const tamperedAmount = await webhook("paymentWebhook", {
    ...event,
    amountMinor: payment.total.amountMinor + 1,
    eventId: `phase18-payment-tamper-${suffix}`,
  });
  assert.equal(
    tamperedAmount.response.status,
    400,
    "Tampered payment amount accepted",
  );
  assert.equal(await paymentStatus(payment.paymentId), "PENDING");

  const applied = await webhook("paymentWebhook", event);
  assert.ok(applied.response.ok, "Valid payment webhook failed");
  assert.equal(await paymentStatus(payment.paymentId), "PAID");
  const replay = await webhook("paymentWebhook", event);
  assert.ok(replay.response.ok && replay.data.duplicate === true);

  const refund = await callFunction("initiateRefund", accounts.admin.token, {
    amount: { amountMinor: 500, currency: "PKR" },
    idempotencyKey: `phase18refund${suffix}`,
    paymentId: payment.paymentId,
    reason: "Security replay test",
  });
  assert.ok(refund.response.ok, "Refund initiation failed");
  const refundId = refund.data.result.refundId;

  const refundEvent = {
    eventId: `phase18-refund-event-${suffix}`,
    refundId,
    status: "SUCCEEDED",
  };
  const forgedRefund = await webhook("refundWebhook", refundEvent, false);
  assert.equal(
    forgedRefund.response.status,
    401,
    "Forged refund webhook accepted",
  );
  assert.equal(await refundStatus(refundId), "PENDING");
  const completedRefund = await webhook("refundWebhook", refundEvent);
  assert.ok(completedRefund.response.ok, "Valid refund webhook failed");
  assert.equal(await refundStatus(refundId), "COMPLETED");
  const refundReplay = await webhook("refundWebhook", refundEvent);
  assert.ok(refundReplay.response.ok && refundReplay.data.duplicate === true);
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
      const response = await fetch(`${appOrigin}/`);
      if (response.ok) return;
    } catch {
      // Next.js is still starting.
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

async function verifyNextSecurityHeaders(accounts) {
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
      "3118",
    ],
    {
      cwd: frontendRoot,
      env: {
        ...process.env,
        NEXT_PUBLIC_APP_URL: "https://bazm.online",
        NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  try {
    await waitForNextServer(nextServer);
    const home = await fetch(`${appOrigin}/`);
    const csp = home.headers.get("content-security-policy") ?? "";
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /connect-src/);
    assert.equal(home.headers.get("x-content-type-options"), "nosniff");
    assert.equal(home.headers.get("x-frame-options"), "DENY");
    assert.equal(
      home.headers.get("cross-origin-opener-policy"),
      "same-origin-allow-popups",
    );
    assert.match(
      home.headers.get("strict-transport-security") ?? "",
      /max-age=63072000/,
    );
    assert.match(
      home.headers.get("permissions-policy") ?? "",
      /camera=\(\), microphone=\(\), geolocation=\(\)/,
    );

    const crossOriginSession = await fetch(`${appOrigin}/api/auth/session`, {
      body: JSON.stringify({ idToken: accounts.customer.token }),
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.test",
      },
      method: "POST",
    });
    assert.equal(crossOriginSession.status, 403, "CSRF origin was accepted");

    const staleSession = await fetch(`${appOrigin}/api/auth/session`, {
      body: JSON.stringify({ idToken: accounts.staleAdmin.token }),
      headers: { "content-type": "application/json", origin: appOrigin },
      method: "POST",
    });
    assert.equal(staleSession.status, 403, "Stale claims became a session");

    const session = await fetch(`${appOrigin}/api/auth/session`, {
      body: JSON.stringify({ idToken: accounts.customer.token }),
      headers: { "content-type": "application/json", origin: appOrigin },
      method: "POST",
    });
    const cookie = session.headers.get("set-cookie") ?? "";
    assert.ok(session.ok, "Valid session was rejected");
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Priority=High/i);
    assert.match(
      session.headers.get("cache-control") ?? "",
      /private.*no-store/i,
      "Session API must be private no-store",
    );
  } finally {
    await stopNextServer(nextServer);
  }
}

async function verifyAuditLogsAreSafe() {
  const auditSnapshot = await firestore
    .collection("auditLogs")
    .limit(200)
    .get();
  const auditEntries = auditSnapshot.docs.map((document) => document.data());
  assert.ok(
    auditEntries.some((entry) => entry.action === "AUTH"),
    "Auth/admin access changes must write audit logs",
  );
  assert.ok(
    auditEntries.some(
      (entry) =>
        entry.action === "PAYMENT" &&
        entry.metadata?.event === "refund-initiate",
    ),
    "Refund initiation must write a payment audit log",
  );
  assert.ok(
    auditEntries.some(
      (entry) =>
        entry.action === "PAYMENT" &&
        entry.metadata?.event === "refund-complete",
    ),
    "Refund completion must write a payment audit log",
  );
  const forbidden =
    /(password|id[_-]?token|refresh[_-]?token|authorization|cookie|secret|card|cvv|email|phone|line1|postalcode)/i;
  const offenders = auditEntries
    .map((entry) => JSON.stringify(entry.metadata ?? {}))
    .filter((metadata) => forbidden.test(metadata));
  assert.deepEqual(offenders, [], "Audit metadata contains sensitive fields");
}

try {
  assertStaticSecurityPosture();

  const accounts = {
    admin: await account({ label: "admin", role: "ADMIN" }),
    customer: await account({ label: "customer", role: "CUSTOMER" }),
    staleAdmin: await account({
      claimsVersion: 0,
      label: "stale-admin",
      role: "ADMIN",
    }),
    staleCustomer: await account({
      claimsVersion: 0,
      label: "stale-customer",
      role: "CUSTOMER",
    }),
    target: await account({ label: "target", role: "CUSTOMER" }),
  };

  await verifyCallableAttackMatrix(accounts);
  await verifyWebhookAttacks(accounts);
  await verifyNextSecurityHeaders(accounts);
  await verifyAuditLogsAreSafe();

  console.log(
    "Phase 18 security flow passed stale-claim, disabled-account, rules posture, CSP/header, CSRF, webhook forgery/replay, dependency/secret posture, and audit-redaction checks.",
  );
} finally {
  await deleteApp(app).catch(() => undefined);
}
