"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClientIpFromHeaders = getClientIpFromHeaders;
exports.lookupGeoByIp = lookupGeoByIp;
exports.geoLocationFallback = geoLocationFallback;
const geo_language_1 = require("./geo-language");
const LOCATION_FALLBACK = {
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
function getClientIpFromHeaders(headers) {
    const headerNames = ["cf-connecting-ip", "true-client-ip", "x-real-ip", "x-forwarded-for"];
    for (const name of headerNames) {
        const raw = String(headers.get(name) ?? "").trim();
        if (!raw)
            continue;
        const ip = (name === "x-forwarded-for" ? raw.split(",")[0]?.trim() : raw) ?? "";
        if (ip)
            return ip.replace(/^::ffff:/, "");
    }
    return "";
}
function isPrivateOrLocalIp(ip) {
    if (!ip || ip === "::1" || ip === "127.0.0.1")
        return true;
    if (ip.startsWith("10.") || ip.startsWith("192.168."))
        return true;
    return /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
}
async function fetchJson(url, timeoutMs = 1600) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { accept: "application/json" },
            cache: "no-store",
        });
        if (!res.ok)
            return null;
        return (await res.json());
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timeout);
    }
}
async function lookupGeoByIp(ip, acceptLanguage = "") {
    const clientIp = ip.trim().replace(/^::ffff:/, "");
    if (!clientIp) {
        return geoLocationFallback(acceptLanguage);
    }
    const isLocalIp = isPrivateOrLocalIp(clientIp);
    let geo = {};
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
    const countryCode = (0, geo_language_1.normalizeCountryCode)(String(geo.country_code ?? geo.country ?? ""));
    const recommendedLanguage = (0, geo_language_1.languageForCountry)(countryCode, acceptLanguage);
    const geoCurrency = String(geo.currency ?? "").toUpperCase();
    const recommendedCurrency = ["USD", "EUR", "CNY"].includes(geoCurrency)
        ? geoCurrency
        : (0, geo_language_1.currencyForCountry)(countryCode, recommendedLanguage);
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
        forceLocale: (0, geo_language_1.isForceLocaleCountry)(countryCode),
    };
}
function geoLocationFallback(acceptLanguage = "") {
    const recommendedLanguage = (0, geo_language_1.languageForCountry)("", acceptLanguage);
    return {
        ...LOCATION_FALLBACK,
        recommendedLanguage,
        recommendedCurrency: (0, geo_language_1.currencyForCountry)("", recommendedLanguage),
    };
}
