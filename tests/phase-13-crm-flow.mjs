import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";

const projectId = "demo-bazm-online";
const apiKey = "demo-api-key";
const authOrigin = "http://127.0.0.1:9099";
const functionsOrigin = `http://127.0.0.1:5001/${projectId}/asia-south1`;
const appOrigin = "http://127.0.0.1:3101";
const suffix = Date.now().toString();
const app = getApps()[0] ?? initializeApp({ projectId });
const auth = getAuth(app);
const firestore = getFirestore(app);

async function authRequest(endpoint, body) {
  const response = await fetch(
    `${authOrigin}/identitytoolkit.googleapis.com/v1/${endpoint}?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return { response, data: await response.json() };
}
async function refresh(refreshToken) {
  const response = await fetch(
    `${authOrigin}/securetoken.googleapis.com/v1/token?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    },
  );
  const data = await response.json();
  assert.ok(response.ok && data.id_token);
  return data.id_token;
}
async function call(name, token, data = {}) {
  const response = await fetch(`${functionsOrigin}/${name}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ data }),
  });
  return { response, data: await response.json() };
}
async function account(role, label, permissions = []) {
  const signup = await authRequest("accounts:signUp", {
    email: `phase13-${label}-${suffix}@example.test`,
    password: "Secure123",
    returnSecureToken: true,
  });
  assert.ok(signup.response.ok, JSON.stringify(signup.data));
  const registration = await call("completeRegistration", signup.data.idToken, {
    name: `Phase Thirteen ${label}`,
  });
  assert.ok(registration.response.ok, JSON.stringify(registration.data));
  await firestore.collection("users").doc(signup.data.localId).update({
    role,
    isActive: true,
    emailVerified: true,
    permissions,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await auth.updateUser(signup.data.localId, { emailVerified: true });
  await auth.setCustomUserClaims(signup.data.localId, {
    role,
    isActive: true,
    claimsVersion: 1,
    ...(permissions.length ? { permissions } : {}),
  });
  return {
    uid: signup.data.localId,
    token: await refresh(signup.data.refreshToken),
  };
}
async function createSession(idToken) {
  const response = await fetch(`${appOrigin}/api/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: appOrigin },
    body: JSON.stringify({ idToken }),
  });
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(response.ok && cookie);
  return cookie;
}
async function waitForServer(server) {
  let output = "";
  server.stdout.on("data", (chunk) => {
    output += chunk;
  });
  server.stderr.on("data", (chunk) => {
    output += chunk;
  });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(`${appOrigin}/login`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Next server failed: ${output}`);
}
async function stopServer(server) {
  const stopped = new Promise((resolve) => server.once("exit", resolve));
  server.kill("SIGTERM");
  await Promise.race([
    stopped,
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  if (server.exitCode === null && server.signalCode === null)
    server.kill("SIGKILL");
}
function stamp(date = Timestamp.now()) {
  return { schemaVersion: 1, createdAt: date, updatedAt: date };
}

try {
  const [customer, other, admin, supportStaff, wrongStaff] = await Promise.all([
    account("CUSTOMER", "customer"),
    account("CUSTOMER", "other"),
    account("ADMIN", "admin"),
    account("STAFF", "support", ["support.manage"]),
    account("STAFF", "catalog", ["catalog.manage"]),
  ]);
  const ownOrderId = `p13-order-${suffix}`;
  const otherOrderId = `p13-other-order-${suffix}`;
  await Promise.all([
    firestore
      .collection("orders")
      .doc(ownOrderId)
      .set({ userId: customer.uid }),
    firestore.collection("orders").doc(otherOrderId).set({ userId: other.uid }),
  ]);
  const foreignOrder = await call("createSupportTicket", customer.token, {
    subject: "Foreign order request",
    message: "This request must fail ownership validation.",
    relatedOrderId: otherOrderId,
  });
  assert.equal(
    foreignOrder.response.ok,
    false,
    "Customer linked another user's order",
  );
  const created = await call("createSupportTicket", customer.token, {
    subject: "Delivery needs attention",
    message: "Please help me understand the delivery status.",
    relatedOrderId: ownOrderId,
  });
  assert.ok(
    created.response.ok && created.data.result?.id,
    JSON.stringify(created.data),
  );
  const ticketId = created.data.result.id;
  const ticket = await firestore
    .collection("supportTickets")
    .doc(ticketId)
    .get();
  assert.equal(ticket.get("userId"), customer.uid);
  assert.equal((await ticket.ref.collection("messages").get()).size, 1);

  const otherReply = await call("replyToSupportTicket", other.token, {
    ticketId,
    message: "I should not be able to reply here.",
  });
  assert.equal(otherReply.response.ok, false, "Cross-customer reply succeeded");
  assert.ok(
    (
      await call("replyToSupportTicket", customer.token, {
        ticketId,
        message: "Here is another detail about the delivery.",
      })
    ).response.ok,
  );
  assert.equal((await ticket.ref.get()).get("status"), "IN_PROGRESS");
  assert.equal(
    (
      await call("manageSupportTicket", wrongStaff.token, {
        ticketId,
        status: "RESOLVED",
      })
    ).response.ok,
    false,
    "Unpermissioned staff managed ticket",
  );
  const managed = await call("manageSupportTicket", supportStaff.token, {
    ticketId,
    status: "WAITING_ON_CUSTOMER",
    assignedStaffId: supportStaff.uid,
    message: "We are checking this with fulfilment.",
  });
  assert.ok(managed.response.ok, JSON.stringify(managed.data));
  assert.equal(
    (await ticket.ref.get()).get("assignedStaffId"),
    supportStaff.uid,
  );
  assert.ok(
    (
      await call("manageSupportTicket", admin.token, {
        ticketId,
        status: "RESOLVED",
      })
    ).response.ok,
  );
  assert.ok(
    (
      await call("manageSupportTicket", admin.token, {
        ticketId,
        status: "CLOSED",
      })
    ).response.ok,
  );
  assert.equal(
    (
      await call("manageSupportTicket", admin.token, {
        ticketId,
        status: "OPEN",
      })
    ).response.ok,
    false,
    "Closed ticket reopened through invalid transition",
  );
  const audit = await firestore
    .collection("auditLogs")
    .where("targetId", "==", ticketId)
    .get();
  assert.equal(audit.size, 3, "Ticket management audit trail is incomplete");

  const noConsent = await call("recordCustomerActivity", customer.token, {
    type: "PRODUCT_VIEWED",
    context: { productId: "privacy-test" },
  });
  assert.equal(noConsent.data.result?.recorded, false);
  await firestore
    .collection("users")
    .doc(customer.uid)
    .update({ preferences: { marketingEmail: false, analytics: true } });
  const consented = await call("recordCustomerActivity", customer.token, {
    type: "PRODUCT_VIEWED",
    context: { productId: "privacy-test" },
  });
  assert.equal(consented.data.result?.recorded, true);
  const activities = await firestore
    .collection("customerActivities")
    .where("userId", "==", customer.uid)
    .get();
  const behavioral = activities.docs.find(
    (document) => document.get("type") === "PRODUCT_VIEWED",
  );
  assert.ok(behavioral, "Consented activity was not recorded");
  const retentionDays =
    (behavioral.get("expiresAt").toMillis() - Date.now()) / 86_400_000;
  assert.ok(
    retentionDays > 89 && retentionDays <= 90.1,
    "Activity retention is not 90 days",
  );
  assert.deepEqual(behavioral.get("context"), { productId: "privacy-test" });

  const now = Timestamp.now();
  for (const [index, amount] of [25000, 75000].entries()) {
    await firestore
      .collection("orders")
      .doc(`p13-complete-${index}-${suffix}`)
      .set({
        userId: customer.uid,
        status: "DELIVERED",
        totals: { grandTotal: { amountMinor: amount, currency: "PKR" } },
        placedAt: Timestamp.fromMillis(now.toMillis() - index * 86_400_000),
        ...stamp(),
      });
  }
  await firestore
    .collection("orders")
    .doc(`p13-cancelled-${suffix}`)
    .set({
      userId: customer.uid,
      status: "CANCELLED",
      totals: { grandTotal: { amountMinor: 999999, currency: "PKR" } },
      placedAt: now,
      ...stamp(),
    });
  await firestore
    .collection("wishlists")
    .doc(customer.uid)
    .collection("items")
    .doc("one")
    .set({ productId: "one", ...stamp() });
  await firestore
    .collection("reviews")
    .doc(`p13-review-${suffix}`)
    .set({ userId: customer.uid, ...stamp() });
  for (let index = 0; index < 26; index += 1) {
    await firestore
      .collection("supportTickets")
      .doc(`p13-page-${String(index).padStart(2, "0")}-${suffix}`)
      .set({
        userId: other.uid,
        subject: `Pagination ticket ${index}`,
        initialMessage: "A sufficiently long pagination fixture message.",
        status: "OPEN",
        assignedStaffId: null,
        relatedOrderId: null,
        archivedAt: null,
        ...stamp(Timestamp.fromMillis(now.toMillis() - index * 1000)),
      });
  }
  const firstPage = await firestore
    .collection("supportTickets")
    .orderBy("updatedAt", "desc")
    .limit(26)
    .get();
  assert.equal(
    firstPage.size,
    26,
    "Support pagination fixture lacks a next page",
  );

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
      "3101",
    ],
    {
      cwd: fileURLToPath(new URL("../frontend", import.meta.url)),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  try {
    await waitForServer(nextServer);
    const [adminCookie, supportCookie, wrongCookie, customerCookie] =
      await Promise.all([
        createSession(admin.token),
        createSession(supportStaff.token),
        createSession(wrongStaff.token),
        createSession(customer.token),
      ]);
    const profileResponse = await fetch(
      `${appOrigin}/admin/customers/${customer.uid}`,
      { headers: { cookie: adminCookie } },
    );
    const profileHtml = await profileResponse.text();
    const profileChecks = {
      title: profileHtml.includes("Customer 360"),
      segment: profileHtml.includes("returning"),
      spend: profileHtml.includes('data-spend-minor="100000"'),
      ordersLabel: profileHtml.includes("Completed orders"),
    };
    assert.ok(
      profileResponse.ok && Object.values(profileChecks).every(Boolean),
      `Customer 360 totals/segment did not render correctly. Status ${profileResponse.status}. Checks: ${JSON.stringify(profileChecks)}. Body: ${profileHtml.slice(-1600)}`,
    );
    const supportResponse = await fetch(`${appOrigin}/admin/support`, {
      headers: { cookie: supportCookie },
    });
    const supportHtml = await supportResponse.text();
    assert.ok(
      supportResponse.ok &&
        supportHtml.includes("Support tickets") &&
        supportHtml.includes("Next page"),
      "Support queue or pagination did not render",
    );
    const denied = await fetch(`${appOrigin}/admin/support`, {
      headers: { cookie: wrongCookie },
      redirect: "manual",
    });
    const deniedBody = await denied.text();
    assert.ok(
      denied.headers.get("location")?.includes("/unauthorized") ||
        (deniedBody.includes("NEXT_REDIRECT") &&
          deniedBody.includes("/unauthorized")),
      "Unpermissioned staff rendered support queue",
    );
    const cleanupOrders = firestore.batch();
    for (const id of [
      ownOrderId,
      otherOrderId,
      `p13-complete-0-${suffix}`,
      `p13-complete-1-${suffix}`,
      `p13-cancelled-${suffix}`,
    ])
      cleanupOrders.delete(firestore.collection("orders").doc(id));
    await cleanupOrders.commit();
    const accountResponse = await fetch(`${appOrigin}/account`, {
      headers: { cookie: customerCookie },
    });
    const accountHtml = await accountResponse.text();
    assert.ok(
      accountResponse.ok &&
        accountHtml.includes("Support requests") &&
        accountHtml.includes("Delivery needs attention") &&
        accountHtml.includes("We are checking this with fulfilment."),
      "Customer support history did not render",
    );
  } finally {
    await stopServer(nextServer);
  }
  console.log(
    "Phase 13 CRM flow passed Customer 360 totals, privacy retention, ownership, ticket transitions, staff permissions, audit, and pagination.",
  );
} finally {
  await deleteApp(app).catch(() => undefined);
}
