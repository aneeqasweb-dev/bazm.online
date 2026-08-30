import { describe, expect, it } from "vitest";

import { isOwnedAvatarPath, profileUpdateSchema } from "./profile.js";

describe("profileUpdateSchema", () => {
  it("accepts normalized safe profile fields", () => {
    expect(
      profileUpdateSchema.parse({
        name: "  Aneeqa Khan  ",
        phone: "+923001234567",
        avatarPath: "avatars/customer-1/profile",
      }),
    ).toEqual({
      name: "Aneeqa Khan",
      phone: "+923001234567",
      avatarPath: "avatars/customer-1/profile",
    });
  });

  it("rejects malformed phone numbers and credential fields", () => {
    expect(
      profileUpdateSchema.safeParse({
        name: "Customer",
        phone: "03001234567",
        avatarPath: null,
        password: "must-never-be-stored",
      }).success,
    ).toBe(false);
  });
});

describe("isOwnedAvatarPath", () => {
  it("only accepts the caller's fixed avatar object", () => {
    expect(isOwnedAvatarPath("customer-1", null)).toBe(true);
    expect(isOwnedAvatarPath("customer-1", "avatars/customer-1/profile")).toBe(
      true,
    );
    expect(isOwnedAvatarPath("customer-1", "avatars/customer-2/profile")).toBe(
      false,
    );
  });
});
