import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import {
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  getSiteUrl,
  SITE_NAME,
} from "@/lib/seo/config";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: SITE_NAME,
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: DEFAULT_TITLE,
    template: "%s | Bazm",
  },
  description: DEFAULT_DESCRIPTION,
  alternates: { canonical: getSiteUrl() },
  openGraph: {
    description: DEFAULT_DESCRIPTION,
    locale: "en_PK",
    siteName: SITE_NAME,
    title: DEFAULT_TITLE,
    type: "website",
    url: getSiteUrl(),
  },
  robots: {
    follow: true,
    googleBot: {
      follow: true,
      index: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
    index: true,
  },
  twitter: {
    card: "summary",
    description: DEFAULT_DESCRIPTION,
    title: DEFAULT_TITLE,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-PK"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
