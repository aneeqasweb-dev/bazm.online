const authPaths = new Set([
  "/login",
  "/register",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
]);

export function safeNextPath(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\x00-\x20]|%5c|%0[ad]/i.test(value)
  )
    return "/account";
  try {
    const url = new URL(value, "https://bazm.invalid");
    if (
      url.origin !== "https://bazm.invalid" ||
      authPaths.has(url.pathname.replace(/\/$/, "")) ||
      /^\/api(?:\/|$)/.test(url.pathname)
    )
      return "/account";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/account";
  }
}

export function authHref(
  path: string,
  nextPath = "/account",
  extra: Record<string, string> = {},
) {
  const query = new URLSearchParams(extra);
  const next = safeNextPath(nextPath);
  if (next !== "/account") query.set("next", next);
  return `${path}${query.size ? `?${query}` : ""}`;
}

export function authNextFromParams(
  params: Record<string, string | string[] | undefined>,
) {
  if (typeof params.next === "string") return safeNextPath(params.next);
  // Only the validated local destination is read from Firebase's continue URL.
  if (typeof params.continueUrl === "string") {
    try {
      return safeNextPath(new URL(params.continueUrl).searchParams.get("next"));
    } catch {
      /* Invalid action links fall back to the account page. */
    }
  }
  return "/account";
}
