import type { MetadataRoute } from "next";

import { listPublicSitemapEntries } from "@/lib/seo/sitemap-data";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return listPublicSitemapEntries();
}
