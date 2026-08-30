const projectId = "demo-bazm-online";
const email = `registration-${Date.now()}@example.test`;
const password = "Secure123";

const signUpResponse = await fetch(
  "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key",
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  },
);
const signUp = await signUpResponse.json();
if (!signUpResponse.ok || !signUp.idToken || !signUp.localId) {
  throw new Error(`Auth emulator sign-up failed: ${JSON.stringify(signUp)}`);
}

const callableResponse = await fetch(
  `http://127.0.0.1:5001/${projectId}/asia-south1/completeRegistration`,
  {
    method: "POST",
    headers: {
      authorization: `Bearer ${signUp.idToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ data: { name: "Emulator Customer" } }),
  },
);
const callable = await callableResponse.json();
if (
  !callableResponse.ok ||
  callable?.result?.ok !== true ||
  callable?.result?.role !== "CUSTOMER"
) {
  throw new Error(
    `Registration callable failed: ${callableResponse.status} ${JSON.stringify(callable)}`,
  );
}

const refreshResponse = await fetch(
  "http://127.0.0.1:9099/securetoken.googleapis.com/v1/token?key=demo-api-key",
  {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: signUp.refreshToken,
    }),
  },
);
const refreshed = await refreshResponse.json();
if (!refreshResponse.ok || !refreshed.id_token) {
  throw new Error(`Auth token refresh failed: ${JSON.stringify(refreshed)}`);
}

const profileResponse = await fetch(
  `http://127.0.0.1:8081/v1/projects/${projectId}/databases/(default)/documents/users/${signUp.localId}`,
  { headers: { authorization: `Bearer ${refreshed.id_token}` } },
);
const profile = await profileResponse.json();
if (
  !profileResponse.ok ||
  profile?.fields?.role?.stringValue !== "CUSTOMER" ||
  profile?.fields?.name?.stringValue !== "Emulator Customer"
) {
  throw new Error(
    `Trusted customer profile verification failed: ${profileResponse.status} ${JSON.stringify(profile)}`,
  );
}

console.log(
  "Registration passed its Auth, Functions, and Firestore emulator flow.",
);
