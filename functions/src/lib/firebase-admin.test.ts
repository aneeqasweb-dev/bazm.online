import { describe, expect, it } from "vitest";

import { getAdminApp } from "./firebase-admin.js";

describe("Firebase Admin initialization", () => {
  it("reuses one application instance", () => {
    expect(getAdminApp()).toBe(getAdminApp());
  });
});
