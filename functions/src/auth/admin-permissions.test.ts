import { describe, expect, it } from "vitest";

import { hasAdminPermission } from "./admin-permissions.js";

describe("admin permissions", () => {
  it("allows ADMIN and SUPER_ADMIN to use every module permission", () => {
    expect(
      hasAdminPermission(
        { role: "ADMIN", claimsVersion: 1, isActive: true },
        "orders.manage",
      ),
    ).toBe(true);
    expect(
      hasAdminPermission(
        { role: "SUPER_ADMIN", claimsVersion: 1, isActive: true },
        "settings.manage",
      ),
    ).toBe(true);
  });

  it("allows STAFF only when the required permission is present", () => {
    expect(
      hasAdminPermission(
        { role: "STAFF", claimsVersion: 1, permissions: ["orders.manage"] },
        "orders.manage",
      ),
    ).toBe(false);
    expect(
      hasAdminPermission(
        {
          role: "STAFF",
          claimsVersion: 1,
          isActive: true,
          permissions: ["orders.manage"],
        },
        "orders.manage",
      ),
    ).toBe(true);
    expect(
      hasAdminPermission(
        {
          role: "STAFF",
          claimsVersion: 1,
          isActive: true,
          permissions: ["catalog.manage"],
        },
        "orders.manage",
      ),
    ).toBe(false);
  });

  it("rejects customers even if they spoof a permission claim", () => {
    expect(
      hasAdminPermission(
        {
          role: "CUSTOMER",
          claimsVersion: 1,
          isActive: true,
          permissions: ["orders.manage"],
        },
        "orders.manage",
      ),
    ).toBe(false);
  });

  it("denies missing or stale claim versions before role evaluation", () => {
    expect(hasAdminPermission({ role: "ADMIN" }, "orders.manage")).toBe(false);
    expect(
      hasAdminPermission(
        { role: "ADMIN", claimsVersion: 0, isActive: true },
        "orders.manage",
      ),
    ).toBe(false);
    expect(
      hasAdminPermission(
        { role: "ADMIN", claimsVersion: 1, isActive: false },
        "orders.manage",
      ),
    ).toBe(false);
  });
});
