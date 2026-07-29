import fs from "fs";
import path from "path";

import { MarketingHomeClient } from "@/components/marketing/marketing-home-client";
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n";
import { organizationJsonLd, webSiteJsonLd } from "@/lib/seo";

import "../marketing-globals.css";

type Props = { params: Promise<{ locale: string }> };

function loadHomeMarkup(): string {
  const p = path.join(process.cwd(), "marketing-templates", "home-markup.html");
  return fs.readFileSync(p, "utf8");
}

export default async function LocaleHomePage({ params }: Props) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : defaultLocale;
  const html = loadHomeMarkup();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webSiteJsonLd(locale)) }}
      />
      <MarketingHomeClient markupHtml={html} />
    </>
  );
}
