import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "bazm_guest_cart";
export const CART_LIFETIME_SECONDS = 30 * 24 * 60 * 60;

export async function getGuestCartId() {
  const value = (await cookies()).get(COOKIE_NAME)?.value;
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

// Only route handlers create or clear the HttpOnly cart cookie.
export async function ensureGuestCartId() {
  const existing = await getGuestCartId();
  if (existing) return existing;
  const id = randomBytes(32).toString("hex");
  (await cookies()).set(COOKIE_NAME, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CART_LIFETIME_SECONDS,
  });
  return id;
}

export async function clearGuestCartId() {
  (await cookies()).delete(COOKIE_NAME);
}
