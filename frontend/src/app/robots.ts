import type { MetadataRoute } from "next";

import { absoluteUrl, getSiteUrl } from "@/lib/seo/config";

function blocksIndexingForEnvironment() {
  return (
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true" ||
    process.env.VERCEL_ENV === "preview" ||
    (process.env.NODE_ENV !== "production" &&
      process.env.NEXT_PUBLIC_ALLOW_LOCAL_INDEXING !== "true")
  );
}

export default function robots(): MetadataRoute.Robots {
  if (blocksIndexingForEnvironment()) {
    return {
      host: getSiteUrl(),
      rules: {
        disallow: "/",
        userAgent: "*",
      },
      sitemap: absoluteUrl("/sitemap.xml"),
    };
  }

  return {
    host: getSiteUrl(),
    rules: {
      allow: "/",
      disallow: [
        "/account",
        "/admin",
        "/api",
        "/cart",
        "/checkout",
        "/forgot-password",
        "/login",
        "/register",
        "/reset-password",
        "/unauthorized",
        "/verify-email",
        "/wishlist",
      ],
      userAgent: "*",
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
