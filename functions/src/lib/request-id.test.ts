import { describe, expect, it } from "vitest";

import { resolveRequestId } from "./request-id.js";

describe("resolveRequestId", () => {
  it("preserves a safe caller request ID", () => {
    expect(resolveRequestId("checkout:request-123")).toBe(
      "checkout:request-123",
    );
  });

  it("replaces malformed values", () => {
    expect(resolveRequestId("unsafe request id\nforged")).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });
});
