"use client";

import { getFirebaseClientEnv } from "@/lib/env/client";
import { authHref } from "./navigation";

export function emailActionSettings(
  action: "verify" | "reset",
  nextPath = "/account",
) {
  const configuredOrigin = getFirebaseClientEnv().NEXT_PUBLIC_APP_URL;
  const origin = configuredOrigin ?? window.location.origin;
  const path =
    action === "verify"
      ? authHref("/verify-email", nextPath)
      : authHref("/login", nextPath, { reset: "complete" });
  const url = new URL(path, origin);
  // Firebase's authorized development domain is localhost, not its IP alias.
  if (!configuredOrigin && ["127.0.0.1", "[::1]"].includes(url.hostname)) {
    url.hostname = "localhost";
  }
  return { url: url.href };
}
