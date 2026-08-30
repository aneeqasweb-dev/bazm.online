import { describe, expect, it } from "vitest";

import { registrationProfileSchema } from "./registration.js";

describe("registration profile validation", () => {
  it("normalizes a valid customer name", () => {
    expect(
      registrationProfileSchema.parse({ name: "  Aneeqa Pervaiz  " }),
    ).toEqual({
      name: "Aneeqa Pervaiz",
    });
  });

  it("rejects an invalid customer name", () => {
    expect(registrationProfileSchema.safeParse({ name: "A" }).success).toBe(
      false,
    );
  });
});
