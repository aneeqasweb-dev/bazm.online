import { describe, expect, it } from "vitest";

import imageLoader from "./image-loader";

describe("imageLoader", () => {
  it("delegates Cloudinary optimization to the delivery URL", () => {
    expect(
      imageLoader({
        src: "https://res.cloudinary.com/demo/image/upload/v1/bazm/product.png",
        width: 640,
        quality: 70,
      }),
    ).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_70,w_640/v1/bazm/product.png",
    );
  });

  it("leaves non-Cloudinary URLs unchanged", () => {
    expect(imageLoader({ src: "/logo.svg", width: 320 })).toBe("/logo.svg");
  });
});
