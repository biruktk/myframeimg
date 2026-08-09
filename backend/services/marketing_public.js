"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPublicSitePayload = getPublicSitePayload;
exports.priceBySkuFromDb = priceBySkuFromDb;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const marketing_defaults_1 = require("../data/marketing_defaults");
const marketing_content_pages_default_1 = require("../data/marketing_content_pages_default");
const store_1 = require("../db/store");
/** Mirrors myframe_official_web/src/pageContentDefaults.js (npm run sync-official-pages). */
function readOfficialPagesSnapshot() {
    const candidates = [
        path_1.default.join(process.cwd(), "dist/data/marketing_official_pages_snapshot.json"),
        path_1.default.join(process.cwd(), "src/data/marketing_official_pages_snapshot.json"),
    ];
    for (const p of candidates) {
        try {
            if (fs_1.default.existsSync(p)) {
                const raw = fs_1.default.readFileSync(p, "utf8");
                const parsed = JSON.parse(raw);
                return parsed;
            }
        }
        catch {
            /* continue */
        }
    }
    return {};
}
function mergeContentPagesWithDefaults(stored) {
    const official = readOfficialPagesSnapshot();
    const officialEn = official["en"] ?? {};
    const langKeys = new Set([
        ...Object.keys(official),
        ...Object.keys(marketing_content_pages_default_1.marketingContentPagesDefault),
        ...(stored ? Object.keys(stored) : []),
    ]);
    const out = {};
    for (const lang of langKeys) {
        const defLang = marketing_content_pages_default_1.marketingContentPagesDefault[lang] ?? {};
        const offLang = official[lang] ?? {};
        const mergedLangRaw = stored?.[lang];
        const storedLang = mergedLangRaw && typeof mergedLangRaw === "object"
            ? mergedLangRaw
            : {};
        const slugs = new Set([
            ...Object.keys(offLang),
            ...Object.keys(officialEn),
            ...Object.keys(defLang),
            ...Object.keys(storedLang),
        ]);
        out[lang] = {};
        for (const slug of slugs) {
            const o = offLang[slug] ?? officialEn[slug];
            const d = defLang[slug];
            const s = storedLang[slug];
            const titleFallback = slug.replace(/-/g, " ");
            const title = String((s?.title ?? o?.title ?? d?.title ?? titleFallback) || titleFallback).trim();
            const bodyRaw = String(s?.body ?? o?.body ?? d?.body ?? "").trim();
            const body = bodyRaw ||
                `<p>This page (${slug.replace(/[<>&]/g, "")}) is not published yet.</p>`;
            const excerptRaw = String(s?.excerpt ?? o?.excerpt ?? d?.excerpt ?? "").trim();
            const row = { title, body };
            if (excerptRaw)
                row.excerpt = excerptRaw;
            out[lang][slug] = row;
        }
    }
    return out;
}
function mergeMarketingSite(stored) {
    const s = (0, marketing_defaults_1.marketingSiteSeed)();
    const u = stored ?? {};
    return {
        ...s,
        ...u,
        basic: { ...s.basic, ...(u.basic ?? {}) },
        footer: { ...s.footer, ...(u.footer ?? {}) },
        maintenance: { ...s.maintenance, ...(u.maintenance ?? {}) },
        media: { ...s.media, ...(u.media ?? {}) },
        translations: { ...s.translations, ...(u.translations ?? {}) },
        translatedFeatures: { ...s.translatedFeatures, ...(u.translatedFeatures ?? {}) },
        contentPages: { ...s.contentPages, ...(u.contentPages ?? {}) },
        seo: Array.isArray(u.seo) && u.seo.length > 0 ? u.seo : s.seo,
        menus: Array.isArray(u.menus) && u.menus.length > 0 ? u.menus : s.menus,
        footerLinks: Array.isArray(u.footerLinks) && u.footerLinks.length > 0 ? u.footerLinks : s.footerLinks,
        socials: Array.isArray(u.socials) && u.socials.length > 0 ? u.socials : s.socials,
        features: Array.isArray(u.features) && u.features.length > 0 ? u.features : s.features,
        products: Array.isArray(u.products) && u.products.length > 0 ? u.products : s.products,
        gateways: Array.isArray(u.gateways) && u.gateways.length > 0 ? u.gateways : s.gateways,
    };
}
function getPublicSitePayload() {
    const data = store_1.db.read();
    const merged = mergeMarketingSite(data.marketingSite);
    const cms = data.marketingCms;
    let languages = marketing_defaults_1.staticLanguages;
    let currencies = marketing_defaults_1.staticCurrencies;
    if (cms?.languages?.length) {
        languages = cms.languages
            .filter((l) => String(l.is_active ?? "1") === "1")
            .sort((a, b) => (a.language_order ?? 0) - (b.language_order ?? 0))
            .map((l) => ({
            code: l.code,
            name: l.name,
            native_name: l.native_name || l.name,
            language_order: Number(l.language_order) || 1,
        }));
    }
    if (cms?.currencies?.length) {
        currencies = cms.currencies
            .filter((c) => String(c.is_active ?? "1") === "1")
            .map((c) => ({
            name: c.name,
            sign: c.sign,
            value: Number(c.value) || 1,
            is_default: c.is_default === "1" || c.is_default === "true" ? 1 : 0,
        }));
    }
    return {
        ...merged,
        contentPages: mergeContentPagesWithDefaults(merged.contentPages),
        languages,
        currencies,
    };
}
function priceBySkuFromDb() {
    const merged = mergeMarketingSite(store_1.db.read().marketingSite);
    const prices = {};
    for (const row of merged.products) {
        const sku = String(row?.sku ?? "").trim();
        const price = Number(row?.price);
        if (sku && Number.isFinite(price))
            prices[sku] = price;
    }
    return prices;
}
