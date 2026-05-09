"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { CartNavLink } from "@/components/marketing/cart-nav-link";
import { defaultLocale, type Locale } from "@/lib/i18n";
import { localizeMarketingMenuHref } from "@/lib/marketing-menu-href";
import { translateMarketingMenuLabel } from "@/lib/marketing-menu-label";
import type { MarketingMenuItem } from "@/lib/marketing-public-site-server";

type LangRow = { code: string; name?: string; native_name?: string };

type Props = {
  locale: Locale;
  menus: MarketingMenuItem[];
  translated: Record<string, string>;
  logoSrc: string;
  languages: LangRow[];
};

export function MarketingContentNav({ locale, menus, translated, logoSrc, languages }: Props) {
  const pathname = usePathname() || "";
  const home = locale === defaultLocale ? `/${defaultLocale}` : `/${locale}`;
  const sorted = [...menus].sort((a, b) => (a.menu_order ?? 0) - (b.menu_order ?? 0));
  const langOptions = languages.length ? languages : [{ code: "en", native_name: "English" }];

  function hrefForLocale(next: string): string {
    const seg = pathname.split("/").filter(Boolean);
    if (seg.length >= 3 && seg[1] === "page") {
      const slug = seg.slice(2).join("/");
      return next === defaultLocale ? `/en/page/${slug}` : `/${next}/page/${slug}`;
    }
    return next === defaultLocale ? `/${defaultLocale}` : `/${next}`;
  }

  return (
    <header className="nav">
      <div className="nav-shell page-shell">
        <Link className="nav-logo" href={home}>
          <img className="brand-logo" src={logoSrc} alt="MyFrame" width={220} height={58} />
        </Link>
        <div className="nav-links">
          {sorted.map((item) => {
            const href = localizeMarketingMenuHref(item.url, locale);
            const label = translateMarketingMenuLabel(item, translated);
            const isCart = /cart/i.test(item.label) || /cart-checkout/i.test(item.url);
            if (isCart) {
              return (
                <CartNavLink key={`${item.label}-${item.url}`} href={href}>
                  {label}
                </CartNavLink>
              );
            }
            return (
              <Link key={`${item.label}-${item.url}`} href={href}>
                {label}
              </Link>
            );
          })}
        </div>
        <div className="nav-right">
          <select
            className="nav-lang"
            value={locale}
            onChange={(e) => {
              window.location.href = hrefForLocale(e.target.value);
            }}
            aria-label="Language"
          >
            {langOptions.map((l) => (
              <option key={l.code} value={l.code}>
                {l.native_name || l.name || l.code}
              </option>
            ))}
          </select>
          <Link className="nav-cta" href={localizeMarketingMenuHref("/cart-checkout.html?add=YX-133P", locale)}>
            <i className="fas fa-gift" /> {translated.buyForGift ?? "Buy for Gift"}
          </Link>
        </div>
      </div>
    </header>
  );
}
