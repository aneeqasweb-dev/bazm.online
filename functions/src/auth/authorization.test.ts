import { describe, expect, it } from "vitest";

import { userRoleSchema } from "./authorization.js";

describe("userRoleSchema", () => {
  it.each(["CUSTOMER", "STAFF", "ADMIN", "SUPER_ADMIN"])(
    "accepts the trusted %s role",
    (role) => {
      expect(userRoleSchema.parse(role)).toBe(role);
    },
  );

  it("rejects a client-invented role", () => {
    expect(userRoleSchema.safeParse("OWNER").success).toBe(false);
  });
});
