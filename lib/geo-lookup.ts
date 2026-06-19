import {
  currencyForCountry,
  isForceLocaleCountry,
  languageForCountry,
  normalizeCountryCode,
  type GeoLocale,
} from "./geo-language";

export type GeoLocationResult = {
  ok: true;
  provider: string;
  ip?: string;
  recommendedLanguage: GeoLocale;
  recommendedCurrency: string;
  countryCode: string;
  country: string;
  region: string;
  city: string;
  postal: string;
  timezone: string;
  forceLocale: boolean;
};

const LOCATION_FALLBACK: GeoLocationResult = {
  ok: true,
  provider: "fallback",
  recommendedLanguage: "en",
  recommendedCurrency: "USD",
  countryCode: "",
  country: "",
  region: "",
  city: "",
  postal: "",
  timezone: "",
  forceLocale: false,
};

export function getClientIpFromHeaders(headers: Headers | { get(name: string): string | null | undefined }): string {
  const headerNames = ["cf-connecting-ip", "true-client-ip", "x-real-ip", "x-forwarded-for"] as const;
  for (const name of headerNames) {
    const raw = String(headers.get(name) ?? "").trim();
    if (!raw) continue;
    const ip = (name === "x-forwarded-for" ? raw.split(",")[0]?.trim() : raw) ?? "";
    if (ip) return ip.replace(/^::ffff:/, "");
  }
  return "";
}

function isPrivateOrLocalIp(ip: string): boolean {
  if (!ip || ip === "::1" || ip === "127.0.0.1") return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  return /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
}

async function fetchJson(url: string, timeoutMs = 1600): Promise<Record<string, unknown> | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function lookupGeoByIp(
  ip: string,
  acceptLanguage = "",
): Promise<GeoLocationResult> {
  const clientIp = ip.trim().replace(/^::ffff:/, "");
  if (!clientIp) {
    return geoLocationFallback(acceptLanguage);
  }

  const isLocalIp = isPrivateOrLocalIp(clientIp);
  let geo: Record<string, unknown> = {};

  const ipapiUrl = isLocalIp
    ? "https://ipapi.co/json/"
    : `https://ipapi.co/${encodeURIComponent(clientIp)}/json/`;
  const ipapi = await fetchJson(ipapiUrl);
  if (ipapi && ipapi.error !== true) {
    geo = { ...ipapi, provider: "ipapi.co" };
  }

  if (!Object.keys(geo).length) {
    const freeUrl = isLocalIp
      ? "https://freeipapi.com/api/json"
      : `https://freeipapi.com/api/json/${encodeURIComponent(ip)}`;
    const free = await fetchJson(freeUrl);
    if (free && (free.countryCode || free.countryName)) {
      geo = {
        country_code: free.countryCode,
        country_name: free.countryName,
        region: free.regionName,
        city: free.cityName,
        postal: free.zipCode,
        timezone: Array.isArray(free.timeZones) ? free.timeZones[0] : "",
        currency: String(free.currency ?? ""),
        provider: "freeipapi.com",
      };
    }
  }

  const countryCode = normalizeCountryCode(
    String(geo.country_code ?? geo.country ?? ""),
  );
  const recommendedLanguage = languageForCountry(countryCode, acceptLanguage);
  const geoCurrency = String(geo.currency ?? "").toUpperCase();
  const recommendedCurrency = ["USD", "EUR", "CNY"].includes(geoCurrency)
    ? geoCurrency
    : currencyForCountry(countryCode, recommendedLanguage);

  return {
    ok: true,
    provider: String(geo.provider ?? (Object.keys(geo).length ? "ipapi.co" : "accept-language-fallback")),
    ip: clientIp || undefined,
    recommendedLanguage,
    recommendedCurrency,
    countryCode,
    country: String(geo.country_name ?? ""),
    region: String(geo.region ?? ""),
    city: String(geo.city ?? ""),
    postal: String(geo.postal ?? ""),
    timezone: String(geo.timezone ?? ""),
    forceLocale: isForceLocaleCountry(countryCode),
  };
}

export function geoLocationFallback(acceptLanguage = ""): GeoLocationResult {
  const recommendedLanguage = languageForCountry("", acceptLanguage);
  return {
    ...LOCATION_FALLBACK,
    recommendedLanguage,
    recommendedCurrency: currencyForCountry("", recommendedLanguage),
  };
}
