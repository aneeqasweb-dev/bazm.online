import { describe, expect, it } from "vitest";

import {
  hasValidImageSignature,
  MEDIA_LIMITS,
  validateMediaFile,
} from "./policy";

describe("media policy", () => {
  it("accepts bounded portfolio image formats", () => {
    expect(
      validateMediaFile({ size: 1024, type: "image/webp" }, "product"),
    ).toBeNull();
  });

  it("rejects unsupported and oversized files", () => {
    expect(
      validateMediaFile({ size: 1024, type: "image/svg+xml" }, "avatar"),
    ).toMatch(/JPEG/);
    expect(
      validateMediaFile(
        { size: MEDIA_LIMITS.review + 1, type: "image/jpeg" },
        "review",
      ),
    ).toMatch(/3 MB/);
  });

  it("checks file signatures instead of trusting browser metadata", () => {
    expect(
      hasValidImageSignature(
        new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
        "image/jpeg",
      ),
    ).toBe(true);
    expect(
      hasValidImageSignature(
        new Uint8Array([0x3c, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74]),
        "image/jpeg",
      ),
    ).toBe(false);
  });
});
