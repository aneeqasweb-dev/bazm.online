import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const projectId = "demo-bazm-online";
const apiKey = "demo-api-key";
const authOrigin = "http://127.0.0.1:9099";
const functionsOrigin = `http://127.0.0.1:5001/${projectId}/asia-south1`;
const appOrigin = "http://127.0.0.1:3100";
const email = `phase-2-${Date.now()}@example.test`;
const initialPassword = "Secure123";
const replacementPassword = "Replacement456";

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
  if (!response.ok || !data.id_token) {
    throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  }
  return data;
}

function assert(condition, message, data) {
  if (!condition) {
    throw new Error(`${message}: ${JSON.stringify(data)}`);
  }
}

const signUp = await authRequest("accounts:signUp", {
  email,
  password: initialPassword,
  returnSecureToken: true,
});
assert(
  signUp.response.ok && signUp.data.idToken,
  "Sign-up failed",
  signUp.data,
);

const duplicate = await authRequest("accounts:signUp", {
  email,
  password: initialPassword,
  returnSecureToken: true,
});
assert(
  !duplicate.response.ok && duplicate.data.error?.message === "EMAIL_EXISTS",
  "Duplicate email was not rejected",
  duplicate.data,
);

const invalidEmail = await authRequest("accounts:signUp", {
  email: "not-an-email",
  password: initialPassword,
  returnSecureToken: true,
});
assert(
  !invalidEmail.response.ok,
  "Invalid email was accepted",
  invalidEmail.data,
);

const registration = await callFunction(
  "completeRegistration",
  signUp.data.idToken,
  { name: "Phase Two Customer" },
);
assert(
  registration.response.ok && registration.data.result?.role === "CUSTOMER",
  "Trusted registration failed",
  registration.data,
);

let refreshed = await refreshToken(signUp.data.refreshToken);
const claimsPayload = JSON.parse(
  Buffer.from(refreshed.id_token.split(".")[1], "base64url").toString("utf8"),
);
assert(
  claimsPayload.role === "CUSTOMER" && claimsPayload.isActive === true,
  "Trusted customer claims were not propagated",
  claimsPayload,
);

const invalidLogin = await authRequest("accounts:signInWithPassword", {
  email,
  password: "WrongPassword123",
  returnSecureToken: true,
});
assert(!invalidLogin.response.ok, "Invalid login succeeded", invalidLogin.data);

const validLogin = await authRequest("accounts:signInWithPassword", {
  email,
  password: initialPassword,
  returnSecureToken: true,
});
assert(
  validLogin.response.ok && validLogin.data.idToken,
  "Valid login failed",
  validLogin.data,
);

const authorization = await callFunction(
  "synchronizeAuthorization",
  validLogin.data.idToken,
);
assert(
  authorization.response.ok && authorization.data.result?.role === "CUSTOMER",
  "Authorization synchronization failed",
  authorization.data,
);

refreshed = await refreshToken(validLogin.data.refreshToken);
const profileUpdate = await callFunction(
  "updateMyProfile",
  refreshed.id_token,
  {
    name: "Updated Customer",
    phone: "+923001234567",
    avatarPath: null,
  },
);
assert(
  profileUpdate.response.ok,
  "Valid profile update failed",
  profileUpdate.data,
);

const privilegeAttempt = await callFunction(
  "updateMyProfile",
  refreshed.id_token,
  {
    name: "Updated Customer",
    phone: null,
    avatarPath: null,
    role: "ADMIN",
  },
);
assert(
  !privilegeAttempt.response.ok,
  "Profile input accepted a role escalation",
  privilegeAttempt.data,
);

const verifyEmailRequest = await authRequest("accounts:sendOobCode", {
  requestType: "VERIFY_EMAIL",
  idToken: refreshed.id_token,
});
assert(
  verifyEmailRequest.response.ok,
  "Verification email request failed",
  verifyEmailRequest.data,
);

const oobResponse = await fetch(
  `${authOrigin}/emulator/v1/projects/${projectId}/oobCodes`,
);
const oobData = await oobResponse.json();
const verificationCode = oobData.oobCodes?.find(
  (item) => item.email === email && item.requestType === "VERIFY_EMAIL",
)?.oobCode;
assert(verificationCode, "Verification code was not generated", oobData);

const verifyEmail = await authRequest("accounts:update", {
  oobCode: verificationCode,
});
assert(verifyEmail.response.ok, "Email verification failed", verifyEmail.data);

const verifiedLogin = await authRequest("accounts:signInWithPassword", {
  email,
  password: initialPassword,
  returnSecureToken: true,
});
const verifiedPayload = JSON.parse(
  Buffer.from(verifiedLogin.data.idToken.split(".")[1], "base64url").toString(
    "utf8",
  ),
);
assert(
  verifiedPayload.email_verified === true,
  "Verified state did not persist",
  verifiedPayload,
);
await callFunction("synchronizeAuthorization", verifiedLogin.data.idToken);
refreshed = await refreshToken(verifiedLogin.data.refreshToken);

const resetRequest = await authRequest("accounts:sendOobCode", {
  requestType: "PASSWORD_RESET",
  email,
});
assert(
  resetRequest.response.ok,
  "Password reset request failed",
  resetRequest.data,
);

const resetOobResponse = await fetch(
  `${authOrigin}/emulator/v1/projects/${projectId}/oobCodes`,
);
const resetOobData = await resetOobResponse.json();
const resetCode = resetOobData.oobCodes?.find(
  (item) => item.email === email && item.requestType === "PASSWORD_RESET",
)?.oobCode;
assert(resetCode, "Password reset code was not generated", resetOobData);

const invalidReset = await authRequest("accounts:resetPassword", {
  oobCode: "invalid-code",
  newPassword: replacementPassword,
});
assert(
  !invalidReset.response.ok,
  "Invalid reset code was accepted",
  invalidReset.data,
);

const reset = await authRequest("accounts:resetPassword", {
  oobCode: resetCode,
  newPassword: replacementPassword,
});
assert(reset.response.ok, "Password reset failed", reset.data);

const oldPasswordLogin = await authRequest("accounts:signInWithPassword", {
  email,
  password: initialPassword,
  returnSecureToken: true,
});
assert(
  !oldPasswordLogin.response.ok,
  "Old password remained valid",
  oldPasswordLogin.data,
);

const newPasswordLogin = await authRequest("accounts:signInWithPassword", {
  email,
  password: replacementPassword,
  returnSecureToken: true,
});
assert(
  newPasswordLogin.response.ok,
  "New password login failed",
  newPasswordLogin.data,
);
await callFunction("synchronizeAuthorization", newPasswordLogin.data.idToken);
const sessionToken = await refreshToken(newPasswordLogin.data.refreshToken);

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
    "3100",
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

async function waitForApp() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${appOrigin}/login`);
      if (response.ok) return;
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Next.js server did not start. ${serverOutput}`);
}

try {
  await waitForApp();
  for (const path of [
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password?oobCode=invalid",
    "/verify-email",
  ]) {
    const response = await fetch(`${appOrigin}${path}`);
    assert(
      response.ok,
      `Auth page smoke check failed for ${path}`,
      response.status,
    );
  }

  const anonymousAccount = await fetch(`${appOrigin}/account`, {
    redirect: "manual",
  });
  assert(
    anonymousAccount.status >= 300 && anonymousAccount.status < 400,
    "Anonymous account access did not redirect",
    anonymousAccount.status,
  );

  const crossOriginSession = await fetch(`${appOrigin}/api/auth/session`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://attacker.test",
    },
    body: JSON.stringify({ idToken: sessionToken.id_token }),
  });
  assert(
    crossOriginSession.status === 403,
    "Cross-origin session was accepted",
    crossOriginSession.status,
  );

  const sessionResponse = await fetch(`${appOrigin}/api/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: appOrigin },
    body: JSON.stringify({ idToken: sessionToken.id_token }),
  });
  const sessionBody = await sessionResponse.json();
  const sessionCookie = sessionResponse.headers
    .get("set-cookie")
    ?.split(";")[0];
  assert(
    sessionResponse.ok && sessionCookie,
    "Session creation failed",
    sessionBody,
  );

  const accountResponse = await fetch(`${appOrigin}/account`, {
    headers: { cookie: sessionCookie },
    redirect: "manual",
  });
  assert(
    accountResponse.ok,
    "Verified account page was not accessible",
    accountResponse.status,
  );

  const customerAdmin = await fetch(`${appOrigin}/admin`, {
    headers: { cookie: sessionCookie },
    redirect: "manual",
  });
  assert(
    customerAdmin.status >= 300 &&
      customerAdmin.status < 400 &&
      customerAdmin.headers.get("location") === "/unauthorized",
    "Customer was not denied the admin page",
    {
      status: customerAdmin.status,
      location: customerAdmin.headers.get("location"),
    },
  );

  const logoutResponse = await fetch(`${appOrigin}/api/auth/session`, {
    method: "DELETE",
    headers: { cookie: sessionCookie, origin: appOrigin },
  });
  assert(
    logoutResponse.ok &&
      logoutResponse.headers.get("set-cookie")?.includes("Max-Age=0"),
    "Session logout did not clear the cookie",
    logoutResponse.status,
  );
} finally {
  const serverStopped = new Promise((resolve) =>
    nextServer.once("exit", resolve),
  );
  nextServer.kill("SIGTERM");
  await Promise.race([
    serverStopped,
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (nextServer.exitCode === null && nextServer.signalCode === null) {
    nextServer.kill("SIGKILL");
    await serverStopped;
  }
}

const adminApp = getApps()[0] ?? initializeApp({ projectId });
await getAuth(adminApp).updateUser(signUp.data.localId, { disabled: true });
const disabledLogin = await authRequest("accounts:signInWithPassword", {
  email,
  password: replacementPassword,
  returnSecureToken: true,
});
assert(
  !disabledLogin.response.ok &&
    disabledLogin.data.error?.message === "USER_DISABLED",
  "Disabled user was able to log in",
  disabledLogin.data,
);

console.log(
  "Phase 2 auth matrix passed registration, claims, login, refresh, verification, recovery, profile, session, logout, disabled-user, and authorization checks.",
);
