import { describe, expect, it } from "vitest";

import { errorResponse, successResponse } from "./api-response.js";

describe("API response envelopes", () => {
  it("creates a typed success envelope", () => {
    expect(successResponse({ status: "ok" }, "request-1")).toEqual({
      ok: true,
      data: { status: "ok" },
      meta: { requestId: "request-1" },
    });
  });

  it("creates a safe error envelope", () => {
    expect(
      errorResponse("INVALID_ARGUMENT", "Invalid request.", "request-2"),
    ).toEqual({
      ok: false,
      error: { code: "INVALID_ARGUMENT", message: "Invalid request." },
      meta: { requestId: "request-2" },
    });
  });
});
