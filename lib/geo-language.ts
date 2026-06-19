export type GeoLocale = "en" | "zh" | "es" | "fr" | "de" | "ja";

/** Mainland + diaspora / Chinese-primary regions — always default to 中文. */
export const CHINESE_SPEAKING_COUNTRIES = new Set([
  "CN",
  "HK",
  "MO",
  "TW",
  "SG",
  "MY",
]);

/** Latin America, Spain, and Ethiopia (business default → Español). */
export const SPANISH_DEFAULT_COUNTRIES = new Set([
  "ET",
  "ES",
  "MX",
  "AR",
  "CL",
  "CO",
  "PE",
  "UY",
  "VE",
  "EC",
  "BO",
  "PY",
  "CR",
  "PA",
  "DO",
  "GT",
  "HN",
  "NI",
  "SV",
  "CU",
  "PR",
  "GQ",
  "AD",
  "BZ",
  "GY",
  "SR",
  "GF",
]);

export function normalizeCountryCode(value: string): string {
  const raw = value.trim().toUpperCase();
  const names: Record<string, string> = {
    "UNITED STATES": "US",
    USA: "US",
    "UNITED STATES OF AMERICA": "US",
    CANADA: "CA",
    CHINA: "CN",
    "HONG KONG": "HK",
    JAPAN: "JP",
    GERMANY: "DE",
    FRANCE: "FR",
    SPAIN: "ES",
    "UNITED KINGDOM": "GB",
    UK: "GB",
    "GREAT BRITAIN": "GB",
    AUSTRALIA: "AU",
    SINGAPORE: "SG",
    ETHIOPIA: "ET",
    MEXICO: "MX",
    ARGENTINA: "AR",
    TAIWAN: "TW",
  };
  if (names[raw]) return names[raw];
  if (/^[A-Z]{2}$/.test(raw)) return raw;
  return raw.slice(0, 2);
}

export function isForceLocaleCountry(countryCode: string): boolean {
  const country = normalizeCountryCode(countryCode);
  return CHINESE_SPEAKING_COUNTRIES.has(country) || SPANISH_DEFAULT_COUNTRIES.has(country);
}

/**
 * Map IP country → site locale.
 * Chinese- and Spanish-default countries ignore Accept-Language (forced default).
 */
export function languageForCountry(countryCode: string, acceptLanguage = ""): GeoLocale {
  const country = normalizeCountryCode(countryCode);
  if (CHINESE_SPEAKING_COUNTRIES.has(country)) return "zh";
  if (SPANISH_DEFAULT_COUNTRIES.has(country)) return "es";
  if (country === "JP") return "ja";
  if (["FR", "BE", "MC", "LU", "CA"].includes(country)) return "fr";
  if (["DE", "AT", "CH"].includes(country)) return "de";

  const accept = acceptLanguage.toLowerCase();
  if (accept.includes("zh")) return "zh";
  if (accept.includes("ja")) return "ja";
  if (accept.includes("es")) return "es";
  if (accept.includes("fr")) return "fr";
  if (accept.includes("de")) return "de";
  return "en";
}

export function currencyForCountry(countryCode: string, language: string): string {
  const country = normalizeCountryCode(countryCode);
  if (CHINESE_SPEAKING_COUNTRIES.has(country) || language === "zh") return "CNY";
  if (["FR", "DE", "ES", "AT", "BE", "LU", "MC", "ET"].includes(country)) return "EUR";
  return "USD";
}
