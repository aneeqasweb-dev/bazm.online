import { describe, expect, it } from "vitest";
import { authHref, authNextFromParams, safeNextPath } from "./navigation";

describe("account return destinations", () => {
  it.each([
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
    "/%5cevil.example",
    "/login",
    "/shop/../register",
    "/api/auth/session",
    "/checkout\n",
    undefined,
    ["/checkout"],
  ])("rejects unsafe or looping return paths: %s", (value) => {
    expect(safeNextPath(value)).toBe("/account");
  });
  it("preserves checkout and review destinations across account links", () => {
    expect(authHref("/register", "/checkout")).toBe(
      "/register?next=%2Fcheckout",
    );
    expect(
      authHref("/login", "/product/bag/review", { reset: "complete" }),
    ).toBe("/login?reset=complete&next=%2Fproduct%2Fbag%2Freview");
    expect(authHref("/login")).toBe("/login");
  });
  it("recovers only a safe local path from email action state", () => {
    expect(
      authNextFromParams({
        continueUrl: "https://bazm.example/verify-email?next=%2Fcheckout",
      }),
    ).toBe("/checkout");
    expect(
      authNextFromParams({
        continueUrl: "https://evil.example/?next=https://evil.example",
      }),
    ).toBe("/account");
    expect(authNextFromParams({ continueUrl: "bad url" })).toBe("/account");
  });
});
