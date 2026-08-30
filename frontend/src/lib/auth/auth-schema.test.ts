import { describe, expect, it } from "vitest";

import {
  forgotPasswordSchema,
  loginSchema,
  profileSchema,
  resetPasswordSchema,
} from "./auth-schema";

describe("authentication schemas", () => {
  it("normalizes a valid login", () => {
    expect(
      loginSchema.parse({
        email: " Customer@Example.COM ",
        password: "secret",
      }),
    ).toEqual({ email: "customer@example.com", password: "secret" });
  });

  it("rejects invalid login and recovery emails", () => {
    expect(
      loginSchema.safeParse({ email: "invalid", password: "" }).success,
    ).toBe(false);
    expect(forgotPasswordSchema.safeParse({ email: "invalid" }).success).toBe(
      false,
    );
  });

  it("rejects a weak or mismatched reset password", () => {
    expect(
      resetPasswordSchema.safeParse({
        password: "weak",
        confirmPassword: "different",
      }).success,
    ).toBe(false);
  });

  it("accepts optional Pakistan-format phone data only", () => {
    expect(
      profileSchema.safeParse({ name: "Customer", phone: "" }).success,
    ).toBe(true);
    expect(
      profileSchema.safeParse({ name: "Customer", phone: "+923001234567" })
        .success,
    ).toBe(true);
    expect(
      profileSchema.safeParse({ name: "Customer", phone: "03001234567" })
        .success,
    ).toBe(false);
  });
});
