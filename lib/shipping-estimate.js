"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shippingEstimateForCountry = shippingEstimateForCountry;
const geo_language_1 = require("./geo-language");
/** Hong Kong origin shipping tiers by destination country. */
function shippingEstimateForCountry(countryCodeRaw) {
    const countryCode = (0, geo_language_1.normalizeCountryCode)(countryCodeRaw);
    if (["HK", "MO"].includes(countryCode)) {
        return { price: 8, currency: "USD", minDays: 1, maxDays: 2, service: "Hong Kong local courier" };
    }
    if (["CN", "TW"].includes(countryCode)) {
        return { price: 12, currency: "USD", minDays: 3, maxDays: 5, service: "Regional express from Hong Kong" };
    }
    if (["JP", "KR", "SG", "MY", "TH", "VN", "PH", "ID"].includes(countryCode)) {
        return { price: 18, currency: "USD", minDays: 4, maxDays: 7, service: "Asia express from Hong Kong" };
    }
    if (["US", "CA", "MX"].includes(countryCode)) {
        return { price: 26, currency: "USD", minDays: 6, maxDays: 10, service: "International express from Hong Kong" };
    }
    if (["GB", "FR", "DE", "ES", "IT", "NL", "BE", "SE", "DK", "NO", "FI", "IE", "AT", "CH", "PT", "PL"].includes(countryCode)) {
        return { price: 28, currency: "USD", minDays: 7, maxDays: 12, service: "International express from Hong Kong" };
    }
    return {
        price: 35,
        currency: "USD",
        minDays: 8,
        maxDays: 15,
        service: "International tracked shipping from Hong Kong",
    };
}
