import type { ImageLoaderProps } from "next/image";

export default function imageLoader({ src, width, quality }: ImageLoaderProps) {
  try {
    const url = new URL(src);
    if (
      url.hostname === "res.cloudinary.com" &&
      url.pathname.includes("/image/upload/")
    ) {
      const transformation = `f_auto,q_${quality ?? "auto"},w_${width}`;
      url.pathname = url.pathname.replace(
        "/image/upload/",
        `/image/upload/${transformation}/`,
      );
      return url.toString();
    }
  } catch {
    // Relative and legacy URLs should remain unchanged.
  }
  return src;
}
