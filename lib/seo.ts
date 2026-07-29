import type { Metadata } from "next";

import { defaultLocale, locales, type Locale } from "@/lib/i18n";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://myframe.ink").replace(/\/$/, "");

export function getSiteUrl(): string {
  return siteUrl;
}

export function localePath(locale: Locale, path = ""): string {
  const p = path.startsWith("/") ? path : path ? `/${path}` : "";
  return locale === defaultLocale && p === "" ? "/" : `/${locale}${p}`;
}

export function buildAlternates(locale: Locale, path = ""): Metadata["alternates"] {
  const languages: Record<string, string> = {};
  for (const l of locales) {
    languages[l] = `${siteUrl}${localePath(l, path)}`;
  }
  languages["x-default"] = `${siteUrl}${localePath(defaultLocale, path)}`;
  return { canonical: `${siteUrl}${localePath(locale, path)}`, languages };
}

export function marketingMetadata(locale: Locale, title: string, description: string): Metadata {
  return {
    title,
    description,
    metadataBase: new URL(siteUrl),
    alternates: buildAlternates(locale),
    openGraph: {
      title,
      description,
      url: `${siteUrl}${localePath(locale)}`,
      siteName: "MyFrame",
      locale: locale === "zh" ? "zh_CN" : locale,
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "MyFrame",
    url: siteUrl,
    logo: `${siteUrl}/ra/logo.svg`,
    description: "Smart photo frame with family sharing and cloud sync.",
  };
}

export function webSiteJsonLd(locale: Locale) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "MyFrame",
    url: `${siteUrl}${localePath(locale)}`,
    inLanguage: locale,
  };
}
