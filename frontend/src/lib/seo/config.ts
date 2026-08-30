import type { Metadata } from "next";

export const SITE_NAME = "Bazm";
export const DEFAULT_SITE_URL = "https://bazm.online";
export const DEFAULT_TITLE = "Bazm — Contemporary Fashion";
export const DEFAULT_DESCRIPTION =
  "A modern, Pakistan-first fashion marketplace built for considered style.";

type SocialImage = {
  alt: string;
  height?: number;
  url: string;
  width?: number;
};

type PublicMetadataInput = {
  description?: string | null;
  images?: SocialImage[];
  noIndex?: boolean;
  path: string;
  title: string;
};

function cleanOrigin(value: string | undefined) {
  const candidate = value?.trim();
  if (!candidate) return DEFAULT_SITE_URL;
  try {
    return new URL(candidate).origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export function getSiteUrl() {
  return cleanOrigin(process.env.NEXT_PUBLIC_APP_URL);
}

export function absoluteUrl(path = "/") {
  if (/^https?:\/\//i.test(path)) return path;
  return new URL(path.startsWith("/") ? path : `/${path}`, getSiteUrl())
    .toString()
    .replace(/\/$/, path === "/" ? "/" : "");
}

export function compactDescription(
  value: string | null | undefined,
  fallback = DEFAULT_DESCRIPTION,
) {
  const normalized = (value ?? fallback).replace(/\s+/g, " ").trim();
  const safe = normalized.length ? normalized : fallback;
  return safe.length <= 160 ? safe : `${safe.slice(0, 157).trimEnd()}…`;
}

export function socialImages(images: SocialImage[] | undefined) {
  return images?.slice(0, 4).map((image) => ({
    alt: image.alt,
    height: image.height,
    url: absoluteUrl(image.url),
    width: image.width,
  }));
}

export function publicMetadata({
  description,
  images,
  noIndex = false,
  path,
  title,
}: PublicMetadataInput): Metadata {
  const canonical = absoluteUrl(path);
  const finalDescription = compactDescription(description);
  const finalImages = socialImages(images);

  return {
    title,
    description: finalDescription,
    alternates: { canonical },
    openGraph: {
      title,
      description: finalDescription,
      siteName: SITE_NAME,
      locale: "en_PK",
      type: "website",
      url: canonical,
      images: finalImages,
    },
    twitter: {
      card: finalImages?.length ? "summary_large_image" : "summary",
      title,
      description: finalDescription,
      images: finalImages?.map((image) => image.url),
    },
    robots: noIndex
      ? {
          index: false,
          follow: true,
          googleBot: {
            index: false,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
          },
        }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
          },
        },
  };
}

export function privateMetadata(
  title: string,
  description = "This Bazm page is private and is not intended for search indexing.",
): Metadata {
  return {
    title,
    description,
    robots: {
      index: false,
      follow: false,
      googleBot: { index: false, follow: false },
    },
  };
}
