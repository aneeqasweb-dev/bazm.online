"use client";

import type { User } from "firebase/auth";

export type AuthorizationResult = {
  ok: true;
  role: "CUSTOMER" | "STAFF" | "ADMIN" | "SUPER_ADMIN";
  emailVerified: boolean;
};

async function authenticatedPost<T>(
  user: User,
  path: string,
  body: Record<string, unknown> = {},
) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      authorization: `Bearer ${await user.getIdToken()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => null)) as
    (T & { error?: string }) | null;
  if (!response.ok || !result) {
    throw new Error(result?.error ?? "AUTHORIZATION_FAILED");
  }
  return result;
}

export function synchronizeAuthorization(user: User) {
  return authenticatedPost<AuthorizationResult>(
    user,
    "/api/auth/authorization",
  );
}

export function completeRegistration(user: User, name: string) {
  return authenticatedPost<AuthorizationResult>(
    user,
    "/api/auth/registration",
    { name },
  );
}
