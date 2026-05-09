import { defaultLocale, type Locale } from "./i18n";

/** Home URL for hash-only section links (pricing, features) away from `/[locale]/page/...`. */
export function marketingHomeWithHash(locale: Locale, hashPart: string): string {
  const h = hashPart.startsWith("#") ? hashPart : `#${hashPart}`;
  return `${locale === defaultLocale ? `/${defaultLocale}` : `/${locale}`}${h}`;
}

export function localizeMarketingMenuHref(url: string, locale: Locale): string {
  const u = String(url ?? "").trim();
  if (!u || u.startsWith("http")) return u;
  if (/\/cart-checkout\.html/i.test(u) || u === "cart-checkout.html") {
    const add = u.includes("?") ? u.slice(u.indexOf("?")) : "";
    return locale === defaultLocale ? `/cart-checkout.html${add}` : `/${locale}/cart${add}`;
  }
  if (u.startsWith("#")) return marketingHomeWithHash(locale, u);
  if (u.endsWith(".html")) return u.startsWith("/") ? u : `/${u}`;
  if (u === "blog") return locale === defaultLocale ? `/blog` : `/${locale}/blog`;
  const clean = u.replace(/^\/+/, "");
  return locale === defaultLocale ? `/page/${clean}` : `/${locale}/page/${clean}`;
}
