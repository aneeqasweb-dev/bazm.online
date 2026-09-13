import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendDirectory = path.dirname(fileURLToPath(import.meta.url));
const isDevelopment = process.env.NODE_ENV === "development";

const usesFirebaseEmulators =
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";
const emulatorImageSources = usesFirebaseEmulators
  ? ["http://127.0.0.1:9199"]
  : [];
const emulatorConnectSources = usesFirebaseEmulators
  ? [
      "http://127.0.0.1:*",
      "ws://127.0.0.1:*",
      "http://localhost:*",
      "ws://localhost:*",
    ]
  : [];
const developmentConnectSources = isDevelopment
  ? [
      "http://127.0.0.1:*",
      "ws://127.0.0.1:*",
      "http://localhost:*",
      "ws://localhost:*",
    ]
  : [];

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  [
    "img-src",
    "'self'",
    "data:",
    "blob:",
    "https://firebasestorage.googleapis.com",
    "https://res.cloudinary.com",
    "https://*.googleusercontent.com",
    ...emulatorImageSources,
  ].join(" "),
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  [
    "script-src",
    "'self'",
    "'unsafe-inline'",
    ...(isDevelopment ? ["'unsafe-eval'"] : []),
    "https://www.google.com",
    "https://www.gstatic.com",
  ].join(" "),
  [
    "connect-src",
    "'self'",
    "https://*.googleapis.com",
    "https://*.firebaseio.com",
    "https://*.firebaseapp.com",
    "https://firebasestorage.googleapis.com",
    "https://www.google-analytics.com",
    "https://analytics.google.com",
    "https://region1.google-analytics.com",
    "wss://*.firebaseio.com",
    ...developmentConnectSources,
    ...emulatorConnectSources,
  ].join(" "),
  "frame-src 'self' https://www.google.com https://accounts.google.com https://*.firebaseapp.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  [
    "media-src",
    "'self'",
    "blob:",
    "https://firebasestorage.googleapis.com",
    ...emulatorImageSources,
  ].join(" "),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
];

const privateCacheHeaders = [
  {
    key: "Cache-Control",
    value: "private, no-store, max-age=0, must-revalidate",
  },
  { key: "Pragma", value: "no-cache" },
  { key: "Expires", value: "0" },
];

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  serverExternalPackages: ["cloudinary"],
  // Dependencies are hoisted to the repository-level node_modules directory.
  // Trace from the workspace root so Vercel includes server-only packages such
  // as firebase-admin in the deployed functions.
  outputFileTracingRoot: path.join(frontendDirectory, ".."),
  async headers() {
    return [
      { headers: securityHeaders, source: "/:path*" },
      { headers: privateCacheHeaders, source: "/account/:path*" },
      { headers: privateCacheHeaders, source: "/admin/:path*" },
      { headers: privateCacheHeaders, source: "/api/auth/:path*" },
      { headers: privateCacheHeaders, source: "/api/account/:path*" },
      { headers: privateCacheHeaders, source: "/api/media/:path*" },
      { headers: privateCacheHeaders, source: "/cart" },
      { headers: privateCacheHeaders, source: "/checkout/:path*" },
      { headers: privateCacheHeaders, source: "/wishlist" },
      {
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=300, stale-while-revalidate=300",
          },
        ],
        source: "/robots.txt",
      },
      {
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=300, stale-while-revalidate=300",
          },
        ],
        source: "/sitemap.xml",
      },
    ];
  },
  images: {
    // The Storage emulator is the only allowed private-network image source.
    // This remains false for every staging and production build.
    dangerouslyAllowLocalIP: usesFirebaseEmulators,
    // Cloudinary performs resizing and format/quality negotiation directly,
    // avoiding a second image proxy and its associated free-tier usage.
    loader: "custom",
    loaderFile: "./src/lib/media/image-loader.ts",
    deviceSizes: [360, 414, 640, 768, 1024, 1280, 1536],
    imageSizes: [64, 96, 128, 256, 384],
    minimumCacheTTL: 3600,
    qualities: [60, 70, 75, 80],
    remotePatterns: [
      {
        hostname: "res.cloudinary.com",
        pathname: "/**",
        protocol: "https",
      },
      {
        hostname: "firebasestorage.googleapis.com",
        pathname: "/v0/b/**",
        protocol: "https",
      },
      {
        hostname: "127.0.0.1",
        pathname: "/v0/b/**",
        port: "9199",
        protocol: "http",
      },
    ],
  },
};

export default nextConfig;
