import { afterEach, describe, expect, it, vi } from "vitest";
import { isTrustedOrigin } from "./trusted-origin";

afterEach(() => vi.unstubAllEnvs());
describe("trusted browser origins", () => {
  it("accepts the browser's local host when Next normalizes the URL", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(
      isTrustedOrigin(
        new Request("http://localhost:3000/api/commands/addCartItem", {
          headers: {
            origin: "http://127.0.0.1:3000",
            host: "127.0.0.1:3000",
            "sec-fetch-site": "same-origin",
          },
        }),
      ),
    ).toBe(true);
  });
  it("accepts the configured public origin behind a proxy", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://bazm.example/");
    expect(
      isTrustedOrigin(
        new Request("http://localhost:3000/api/payments/demo", {
          headers: { origin: "https://bazm.example" },
        }),
      ),
    ).toBe(true);
  });
  it("rejects unrelated and explicitly cross-site requests", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(
      isTrustedOrigin(
        new Request("http://localhost:3000/api/payments/demo", {
          headers: {
            origin: "https://untrusted.example",
            host: "localhost:3000",
          },
        }),
      ),
    ).toBe(false);
    expect(
      isTrustedOrigin(
        new Request("http://localhost:3000/api/payments/demo", {
          headers: {
            origin: "http://localhost:3000",
            "sec-fetch-site": "cross-site",
          },
        }),
      ),
    ).toBe(false);
  });
});
