import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteServerSession } from "./session-client";

afterEach(() => vi.unstubAllGlobals());
describe("server session deletion", () => {
  it("clears the session through the same-origin endpoint", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await expect(deleteServerSession()).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith("/api/auth/session", {
      method: "DELETE",
    });
  });
  it("does not report successful logout when the server rejects deletion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 403 })),
    );
    await expect(deleteServerSession()).rejects.toThrow(
      "SESSION_DELETION_FAILED",
    );
  });
});
