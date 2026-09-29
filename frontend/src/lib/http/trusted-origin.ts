// Next can normalize request.url behind a proxy or a local development host.
export function isTrustedOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  const url = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol =
    request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL
    ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin
    : null;
  return [
    url.origin,
    host ? `${protocol}://${host}` : null,
    configuredOrigin,
  ].includes(origin);
}
