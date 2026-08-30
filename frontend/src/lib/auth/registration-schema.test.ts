import { describe, expect, it } from "vitest";

import { registrationSchema } from "./registration-schema";

const validInput = {
  name: "Aneeqa Pervaiz",
  email: "ANEEQA@example.com",
  password: "Secure123",
  confirmPassword: "Secure123",
};

describe("registrationSchema", () => {
  it("normalizes valid registration input", () => {
    expect(registrationSchema.parse(validInput).email).toBe(
      "aneeqa@example.com",
    );
  });

  it("rejects mismatched passwords", () => {
    const result = registrationSchema.safeParse({
      ...validInput,
      confirmPassword: "Different123",
    });
    expect(result.success).toBe(false);
  });
});
