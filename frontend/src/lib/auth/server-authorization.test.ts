import { describe, expect, it } from "vitest";

import { authorizeSession } from "./server-authorization";

const verifiedCustomer = {
  uid: "customer-1",
  email_verified: true,
  role: "CUSTOMER",
  isActive: true,
  claimsVersion: 1,
};

describe("authorizeSession", () => {
  it("allows an active verified customer into customer pages", () => {
    expect(
      authorizeSession(verifiedCustomer, { requireVerified: true }),
    ).toEqual({ allowed: true });
  });

  it("denies unverified and inactive sessions with a recovery reason", () => {
    expect(
      authorizeSession(
        { ...verifiedCustomer, email_verified: false },
        { requireVerified: true },
      ),
    ).toEqual({ allowed: false, reason: "unverified" });
    expect(authorizeSession({ ...verifiedCustomer, isActive: false })).toEqual({
      allowed: false,
      reason: "disabled",
    });
  });

  it("denies stale or missing claim versions before trusting roles", () => {
    expect(
      authorizeSession({
        ...verifiedCustomer,
        claimsVersion: 0,
        role: "ADMIN",
      }),
    ).toEqual({ allowed: false, reason: "stale-claims" });
    expect(
      authorizeSession({
        uid: "legacy-admin",
        email_verified: true,
        role: "ADMIN",
        isActive: true,
      }),
    ).toEqual({ allowed: false, reason: "stale-claims" });
  });

  it("denies a CUSTOMER from admin routes even if browser state is altered", () => {
    expect(
      authorizeSession(verifiedCustomer, {
        requireVerified: true,
        roles: ["ADMIN", "SUPER_ADMIN"],
      }),
    ).toEqual({ allowed: false, reason: "wrong-role" });
  });

  it("allows administrators and sufficiently-permissioned staff into admin modules", () => {
    expect(
      authorizeSession(
        { ...verifiedCustomer, role: "ADMIN" },
        {
          requireVerified: true,
          roles: ["STAFF", "ADMIN", "SUPER_ADMIN"],
          permissions: ["orders.manage"],
        },
      ),
    ).toEqual({ allowed: true });
    expect(
      authorizeSession(
        {
          ...verifiedCustomer,
          role: "STAFF",
          permissions: ["orders.manage"],
        },
        {
          requireVerified: true,
          roles: ["STAFF", "ADMIN", "SUPER_ADMIN"],
          permissions: ["orders.manage"],
        },
      ),
    ).toEqual({ allowed: true });
  });

  it("denies staff users that lack a required module permission", () => {
    expect(
      authorizeSession(
        {
          ...verifiedCustomer,
          role: "STAFF",
          permissions: ["catalog.manage"],
        },
        {
          requireVerified: true,
          roles: ["STAFF", "ADMIN", "SUPER_ADMIN"],
          permissions: ["orders.manage"],
        },
      ),
    ).toEqual({ allowed: false, reason: "missing-permission" });
  });
});
