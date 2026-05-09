import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MarketingContentNav } from "@/components/marketing/marketing-content-nav";
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n";
import { fetchMarketingPublicSite } from "@/lib/marketing-public-site-server";

import "../../../marketing-globals.css";
import "./content-page.css";
import "./content-pages-mf.css";

type Props = { params: Promise<{ locale: string; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  const locale: Locale = isLocale(raw) ? raw : defaultLocale;
  const site = await fetchMarketingPublicSite();
  const doc =
    site?.contentPages?.[locale]?.[slug] ?? site?.contentPages?.[defaultLocale]?.[slug];
  const titleBase = doc?.title?.trim() || slug.replace(/-/g, " ");
  return {
    title: `${titleBase} | MyFrame`,
    description: doc?.excerpt?.trim() || undefined,
    robots: { index: true, follow: true },
  };
}

export default async function MarketingContentPage({ params }: Props) {
  const { locale: raw, slug } = await params;
  const locale: Locale = isLocale(raw) ? raw : defaultLocale;

  const site = await fetchMarketingPublicSite();
  if (!site) notFound();

  const doc =
    site.contentPages?.[locale]?.[slug] ?? site.contentPages?.[defaultLocale]?.[slug];
  if (!doc?.body) notFound();

  const translated = locale === defaultLocale ? {} : site.translations?.[locale] ?? {};
  const menus = site.menus ?? [];
  const languages = site.languages ?? [];
  const logo = site.basic?.headerLogo?.trim() || "/ra/logo.svg";
  const home = locale === defaultLocale ? `/${defaultLocale}` : `/${locale}`;

  return (
    <div className="content-page-wrap">
      <MarketingContentNav
        locale={locale}
        menus={menus}
        translated={translated}
        logoSrc={logo}
        languages={languages}
      />
      <main className="content-page-main">
        <Link className="content-page-back" href={home}>
          ← Home
        </Link>
        <h1 className="content-page-title">{doc.title || slug}</h1>
        {doc.excerpt ? <p className="content-page-excerpt">{doc.excerpt}</p> : null}
        <div className="content-page-card">
          <article
            className="content-prose mf-prose"
            dangerouslySetInnerHTML={{ __html: doc.body }}
            suppressHydrationWarning
          />
        </div>
      </main>
    </div>
  );
}
