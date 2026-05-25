import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DownloadAppLanding } from "@/app/download/download-app-landing";
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n";
import { fetchMarketingPublicSite } from "@/lib/marketing-public-site-server";

import "../../marketing-globals.css";
import "../../download/download-app.css";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : defaultLocale;

  return {
    title: "Download MyFrame App | MyFrame",
    description:
      "Download the MyFrame app for iPhone and Android to pair your frame, invite family, send photos, and manage albums.",
    alternates: {
      canonical: locale === defaultLocale ? "/download" : `/${locale}/download`,
    },
  };
}

export default async function LocalizedDownloadPage({ params }: Props) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();

  const locale = raw;
  const site = await fetchMarketingPublicSite();
  const translated = locale === defaultLocale ? {} : site?.translations?.[locale] ?? {};

  return (
    <DownloadAppLanding
      locale={locale}
      menus={site?.menus ?? []}
      translated={translated}
      logoSrc={site?.basic?.headerLogo?.trim() || "/assets/myframe-logo-final.svg"}
      languages={site?.languages ?? []}
      downloadLinks={{
        ios: site?.media?.appStoreUrl,
        android: site?.media?.googlePlayUrl,
        miniApp: site?.media?.miniAppUrl,
        apk: site?.media?.apkDownloadUrl,
      }}
    />
  );
}
