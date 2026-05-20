import type { Metadata } from "next";

import { defaultLocale, isLocale, locales, type Locale } from "@/lib/i18n";
import { buildAlternates, marketingMetadata } from "@/lib/seo";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : defaultLocale;
  return marketingMetadata(
    locale,
    "MyFrame — Where Family Appears",
    "Smart photo frame with AI art, family sharing, and live sync.",
  );
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : defaultLocale;
  return <div lang={locale}>{children}</div>;
}
