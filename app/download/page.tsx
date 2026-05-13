import type { Metadata } from "next";

import { defaultLocale } from "@/lib/i18n";
import { fetchMarketingPublicSite } from "@/lib/marketing-public-site-server";

import "../marketing-globals.css";
import "./download-app.css";
import { DownloadAppLanding } from "./download-app-landing";

export const metadata: Metadata = {
  title: "Download MyFrame App | MyFrame",
  description:
    "Download the MyFrame app for iPhone and Android to pair your frame, invite family, send photos, and manage albums.",
  alternates: {
    canonical: "/download",
  },
};

export default async function DownloadPage() {
  const site = await fetchMarketingPublicSite();
  const locale = defaultLocale;
  const translated = site?.translations?.[locale] ?? {};

  return (
    <DownloadAppLanding
      locale={locale}
      menus={site?.menus ?? []}
      translated={translated}
      logoSrc={site?.basic?.headerLogo?.trim() || "/assets/myframe-logo-final.svg"}
      languages={site?.languages ?? []}
    />
  );
}
