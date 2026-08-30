import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const projectId = "demo-bazm-online";
const apiKey = "demo-api-key";
const authOrigin = "http://127.0.0.1:9099";
const functionsOrigin = `http://127.0.0.1:5001/${projectId}/asia-south1`;
const appOrigin = "http://127.0.0.1:3101";
const suffix = Date.now().toString();
const email = `phase-4-${suffix}@example.test`;
const password = "Secure123";

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

async function refreshToken(refreshToken) {
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
  assert.ok(response.ok && data.id_token, "Token refresh failed");
  return data.id_token;
}

async function callFunction(name, idToken, data = {}) {
  const response = await fetch(`${functionsOrigin}/${name}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${idToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ data }),
  });
  return { response, data: await response.json() };
}

function category(name, slug, parentId = null) {
  return {
    name,
    slug,
    parentId,
    sortOrder: 0,
    image: null,
    seo: { title: null, description: null },
  };
}

try {
  const signUp = await authRequest("accounts:signUp", {
    email,
    password,
    returnSecureToken: true,
  });
  assert.ok(signUp.response.ok && signUp.data.idToken && signUp.data.localId);

  const registration = await callFunction(
    "completeRegistration",
    signUp.data.idToken,
    {
      name: "Phase Four Admin",
    },
  );
  assert.ok(registration.response.ok, "Admin fixture registration failed");

  const denied = await callFunction("createCategory", signUp.data.idToken, {
    ...category("Women", `women-${suffix}`),
  });
  assert.equal(denied.response.ok, false, "Customer created a category");

  await auth.setCustomUserClaims(signUp.data.localId, {
    role: "ADMIN",
    isActive: true,
    claimsVersion: 1,
  });
  await auth.updateUser(signUp.data.localId, { emailVerified: true });
  const adminToken = await refreshToken(signUp.data.refreshToken);

  const rootResponse = await callFunction(
    "createCategory",
    adminToken,
    category("Women", `women-${suffix}`),
  );
  assert.ok(rootResponse.response.ok && rootResponse.data.result?.id);
  const rootId = rootResponse.data.result.id;

  const duplicate = await callFunction(
    "createCategory",
    adminToken,
    category("Duplicate Women", `women-${suffix}`),
  );
  assert.equal(
    duplicate.response.ok,
    false,
    "Duplicate category slug was accepted",
  );

  const childResponse = await callFunction(
    "createCategory",
    adminToken,
    category("Dresses", `dresses-${suffix}`, rootId),
  );
  assert.ok(childResponse.response.ok && childResponse.data.result?.id);
  const childId = childResponse.data.result.id;

  const prematureActivation = await callFunction(
    "setCategoryStatus",
    adminToken,
    {
      id: childId,
      status: "ACTIVE",
    },
  );
  assert.equal(
    prematureActivation.response.ok,
    false,
    "A child was activated before its parent",
  );

  assert.ok(
    (
      await callFunction("setCategoryStatus", adminToken, {
        id: rootId,
        status: "ACTIVE",
      })
    ).response.ok,
  );
  assert.ok(
    (
      await callFunction("setCategoryStatus", adminToken, {
        id: childId,
        status: "ACTIVE",
      })
    ).response.ok,
  );

  const grandchildResponse = await callFunction(
    "createCategory",
    adminToken,
    category("Occasion", `occasion-${suffix}`, childId),
  );
  const grandchildId = grandchildResponse.data.result?.id;
  assert.ok(grandchildResponse.response.ok && grandchildId);
  const depthThreeResponse = await callFunction(
    "createCategory",
    adminToken,
    category("Evening", `evening-${suffix}`, grandchildId),
  );
  const depthThreeId = depthThreeResponse.data.result?.id;
  assert.ok(depthThreeResponse.response.ok && depthThreeId);
  const tooDeep = await callFunction(
    "createCategory",
    adminToken,
    category("Formal", `formal-${suffix}`, depthThreeId),
  );
  assert.equal(tooDeep.response.ok, false, "Over-deep hierarchy was accepted");

  const cycle = await callFunction("updateCategory", adminToken, {
    id: rootId,
    input: { parentId: childId },
  });
  assert.equal(cycle.response.ok, false, "Category parent cycle was accepted");

  const archiveParent = await callFunction("setCategoryStatus", adminToken, {
    id: rootId,
    status: "ARCHIVED",
  });
  assert.equal(
    archiveParent.response.ok,
    false,
    "A parent with active children was archived",
  );

  const secondRoot = await callFunction(
    "createCategory",
    adminToken,
    category("Men", `men-${suffix}`),
  );
  const thirdRoot = await callFunction(
    "createCategory",
    adminToken,
    category("Kids", `kids-${suffix}`),
  );
  assert.ok(secondRoot.response.ok && thirdRoot.response.ok);
  const rootIds = [rootId, secondRoot.data.result.id, thirdRoot.data.result.id];

  const incompleteReorder = await callFunction(
    "reorderCategories",
    adminToken,
    {
      parentId: null,
      categoryIds: rootIds.slice(0, 2),
    },
  );
  assert.equal(
    incompleteReorder.response.ok,
    false,
    "Incomplete sibling reorder was accepted",
  );
  assert.ok(
    (
      await callFunction("reorderCategories", adminToken, {
        parentId: null,
        categoryIds: [...rootIds].reverse(),
      })
    ).response.ok,
  );

  const renamed = await callFunction("updateCategory", adminToken, {
    id: rootId,
    input: { slug: `womenswear-${suffix}`, name: "Women’s fashion" },
  });
  assert.ok(renamed.response.ok, "Category edit failed");
  assert.equal(
    (
      await firestore
        .collection("slugRegistry")
        .doc(`category_women-${suffix}`)
        .get()
    ).exists,
    false,
    "Old slug reservation was not released",
  );

  const root = await firestore.collection("categories").doc(rootId).get();
  assert.equal(root.get("depth"), 0);
  assert.equal(root.get("status"), "ACTIVE");
  assert.equal(root.get("slug"), `womenswear-${suffix}`);

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
  let serverOutput = "";
  nextServer.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  nextServer.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });

  try {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try {
        const response = await fetch(`${appOrigin}/login`);
        if (response.ok) break;
      } catch {
        // The production server is still starting.
      }
      if (attempt === 79) {
        throw new Error(`Next.js server did not start. ${serverOutput}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const publicRoot = await fetch(`${appOrigin}/womenswear-${suffix}`);
    assert.ok(
      publicRoot.ok && (await publicRoot.text()).includes("Women’s fashion"),
      "Active public category route did not render",
    );
    const publicChild = await fetch(
      `${appOrigin}/womenswear-${suffix}/dresses-${suffix}`,
    );
    assert.ok(publicChild.ok, "Active nested category route did not render");
    const staleSlug = await fetch(`${appOrigin}/women-${suffix}`);
    assert.equal(
      staleSlug.status,
      404,
      "Old category slug still resolved publicly",
    );

    const sessionResponse = await fetch(`${appOrigin}/api/auth/session`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: appOrigin },
      body: JSON.stringify({ idToken: adminToken }),
    });
    const sessionCookie = sessionResponse.headers
      .get("set-cookie")
      ?.split(";")[0];
    assert.ok(sessionResponse.ok && sessionCookie, "Admin web session failed");
    const adminPage = await fetch(`${appOrigin}/admin/categories`, {
      headers: { cookie: sessionCookie },
    });
    assert.ok(
      adminPage.ok && (await adminPage.text()).includes("Category system"),
      "Protected category workspace did not render for an admin",
    );
  } finally {
    const stopped = new Promise((resolve) => nextServer.once("exit", resolve));
    nextServer.kill("SIGTERM");
    await Promise.race([
      stopped,
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
    if (nextServer.exitCode === null && nextServer.signalCode === null) {
      nextServer.kill("SIGKILL");
      await stopped;
    }
  }

  console.log(
    "Phase 4 category flow passed authorization, hierarchy, slug, status, reorder, update, and public/admin route checks.",
  );
} finally {
  await deleteApp(app).catch(() => undefined);
}
