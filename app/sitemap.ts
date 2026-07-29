import type { MetadataRoute } from "next";

import { defaultLocale, locales } from "@/lib/i18n";
import { getSiteUrl, localePath } from "@/lib/seo";

const staticPaths = ["", "/blog", "/download", "/auth", "/app/home", "/app/family", "/app/send", "/app/settings"];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  for (const locale of locales) {
    for (const p of staticPaths) {
      entries.push({
        url: `${base}${localePath(locale, p)}`,
        lastModified: now,
        changeFrequency: p === "" ? "weekly" : "monthly",
        priority: p === "" ? 1 : p.startsWith("/app") ? 0.6 : 0.7,
      });
    }
  }

  entries.push({
    url: `${base}/download`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.8,
  });

  return entries;
}
