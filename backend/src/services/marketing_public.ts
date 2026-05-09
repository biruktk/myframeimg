import fs from "fs";
import path from "path";

import type { MarketingSiteStored } from "../data/marketing_defaults";
import { marketingSiteSeed, staticCurrencies, staticLanguages } from "../data/marketing_defaults";
import { marketingContentPagesDefault } from "../data/marketing_content_pages_default";
import { db } from "../db/store";

type ContentSlugDoc = {
  title: string;
  excerpt?: string;
  body: string;
};

/** Mirrors myframe_official_web/src/pageContentDefaults.js (npm run sync-official-pages). */
function readOfficialPagesSnapshot(): Record<string, Record<string, ContentSlugDoc>> {
  const candidates = [
    path.join(process.cwd(), "dist/data/marketing_official_pages_snapshot.json"),
    path.join(process.cwd(), "src/data/marketing_official_pages_snapshot.json"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf8");
        const parsed = JSON.parse(raw) as Record<string, Record<string, Partial<ContentSlugDoc> | undefined>>;
        return parsed as Record<string, Record<string, ContentSlugDoc>>;
      }
    } catch {
      /* continue */
    }
  }
  return {};
}

function mergeContentPagesWithDefaults(
  stored: MarketingSiteStored["contentPages"],
): MarketingSiteStored["contentPages"] {
  const official = readOfficialPagesSnapshot();
  const officialEn = official["en"] ?? {};
  const langKeys = new Set<string>([
    ...Object.keys(official),
    ...Object.keys(marketingContentPagesDefault),
    ...(stored ? Object.keys(stored) : []),
  ]);
  const out: Record<string, Record<string, ContentSlugDoc>> = {};
  for (const lang of langKeys) {
    const defLang = marketingContentPagesDefault[lang] ?? {};
    const offLang = official[lang] ?? {};
    const mergedLangRaw = stored?.[lang as keyof MarketingSiteStored["contentPages"]];
    const storedLang =
      mergedLangRaw && typeof mergedLangRaw === "object"
        ? (mergedLangRaw as Record<string, Partial<ContentSlugDoc> | undefined>)
        : {};
    const slugs = new Set<string>([
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
      const body =
        bodyRaw ||
        `<p>This page (${slug.replace(/[<>&]/g, "")}) is not published yet.</p>`;
      const excerptRaw = String(s?.excerpt ?? o?.excerpt ?? d?.excerpt ?? "").trim();
      const row: Record<string, string> = { title, body };
      if (excerptRaw) row.excerpt = excerptRaw;
      out[lang][slug] = row as ContentSlugDoc;
    }
  }
  return out as MarketingSiteStored["contentPages"];
}

function mergeMarketingSite(stored: Partial<MarketingSiteStored> | null | undefined): MarketingSiteStored {
  const s = marketingSiteSeed();
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
    seo: Array.isArray(u.seo) && u.seo.length > 0 ? (u.seo as MarketingSiteStored["seo"]) : s.seo,
    menus: Array.isArray(u.menus) && u.menus.length > 0 ? (u.menus as MarketingSiteStored["menus"]) : s.menus,
    footerLinks:
      Array.isArray(u.footerLinks) && u.footerLinks.length > 0 ? (u.footerLinks as MarketingSiteStored["footerLinks"]) : s.footerLinks,
    socials: Array.isArray(u.socials) && u.socials.length > 0 ? (u.socials as MarketingSiteStored["socials"]) : s.socials,
    features: Array.isArray(u.features) && u.features.length > 0 ? (u.features as MarketingSiteStored["features"]) : s.features,
    products:
      Array.isArray(u.products) && u.products.length > 0 ? (u.products as MarketingSiteStored["products"]) : s.products,
    gateways: Array.isArray(u.gateways) && u.gateways.length > 0 ? (u.gateways as MarketingSiteStored["gateways"]) : s.gateways,
  };
}

export function getPublicSitePayload() {
  const data = db.read();
  const merged = mergeMarketingSite(data.marketingSite as Partial<MarketingSiteStored> | undefined);
  const cms = data.marketingCms;
  let languages = staticLanguages;
  let currencies = staticCurrencies;
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

export function priceBySkuFromDb(): Record<string, number> {
  const merged = mergeMarketingSite(db.read().marketingSite as Partial<MarketingSiteStored> | undefined);
  const prices: Record<string, number> = {};
  for (const row of merged.products as Array<{ sku?: string; price?: number }>) {
    const sku = String(row?.sku ?? "").trim();
    const price = Number(row?.price);
    if (sku && Number.isFinite(price)) prices[sku] = price;
  }
  return prices;
}
