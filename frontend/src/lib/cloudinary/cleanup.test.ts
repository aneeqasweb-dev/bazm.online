import { describe, expect, it } from "vitest";

import { removedMediaPaths } from "./cleanup-policy";

describe("removedMediaPaths", () => {
  it("returns only paths removed by an update", () => {
    expect(
      removedMediaPaths(
        [{ path: "bazm/products/a" }, { path: "bazm/products/b" }],
        [{ path: "bazm/products/b" }, { path: "bazm/products/c" }],
      ),
    ).toEqual(["bazm/products/a"]);
  });

  it("returns no paths when media is unchanged", () => {
    expect(
      removedMediaPaths(
        [{ path: "bazm/products/a" }],
        [{ path: "bazm/products/a" }],
      ),
    ).toEqual([]);
  });
});
