import { defaultLocale, type Locale } from "./i18n";

/** Home URL for hash-only section links (pricing, features) away from `/[locale]/page/...`. */
export function marketingHomeWithHash(locale: Locale, hashPart: string): string {
  const h = hashPart.startsWith("#") ? hashPart : `#${hashPart}`;
  return `${locale === defaultLocale ? `/${defaultLocale}` : `/${locale}`}${h}`;
}

export function localizeMarketingMenuHref(url: string, locale: Locale): string {
  const u = String(url ?? "").trim();
  if (!u || u.startsWith("http")) return u;
  if (u === "customer-login") return locale === defaultLocale ? "/en/auth" : `/${locale}/auth`;
  if (
    u === "download" ||
    u === "download-app" ||
    u === "page/download-app" ||
    u === "/page/download-app"
  ) {
    return locale === defaultLocale ? "/download" : `/${locale}/download`;
  }
  if (/\/cart-checkout\.html/i.test(u) || u === "cart-checkout.html") {
    const add = u.includes("?") ? u.slice(u.indexOf("?")) : "";
    return locale === defaultLocale ? `/cart-checkout.html${add}` : `/${locale}/cart${add}`;
  }
  if (u.startsWith("#")) return marketingHomeWithHash(locale, u);
  if (u.endsWith(".html")) return u.startsWith("/") ? u : `/${u}`;
  if (u === "blog") return locale === defaultLocale ? `/${defaultLocale}/blog` : `/${locale}/blog`;
  const clean = u.replace(/^\/+/, "");
  return `/${locale === defaultLocale ? defaultLocale : locale}/page/${clean}`;
}
