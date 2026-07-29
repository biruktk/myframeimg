import { NextResponse } from "next/server";

import publicSiteDevFallback from "../../../../fixtures/public-site-dev-fallback.json";
import { getMyframeApiBase } from "@/lib/backend-url";

function hasContentPages(payload: unknown): boolean {
  const pages = (payload as { contentPages?: unknown })?.contentPages;
  if (!pages || typeof pages !== "object") return false;
  return Object.values(pages as Record<string, unknown>).some(
    (langPages) =>
      langPages &&
      typeof langPages === "object" &&
      Object.keys(langPages as Record<string, unknown>).length > 0,
  );
}

function withFallbackMarketing(payload: unknown) {
  if (!payload || typeof payload !== "object") return publicSiteDevFallback;
  const base = payload as Record<string, unknown>;
  const fb = publicSiteDevFallback as {
    translations?: Record<string, Record<string, unknown>>;
    translatedFeatures?: Record<string, unknown>;
    contentPages?: Record<string, unknown>;
  };
  const mergedTranslations: Record<string, Record<string, unknown>> = { ...(fb.translations ?? {}) };
  const incoming = (base.translations ?? {}) as Record<string, Record<string, unknown>>;
  for (const [locale, row] of Object.entries(incoming)) {
    mergedTranslations[locale] = { ...(mergedTranslations[locale] ?? {}), ...row };
  }
  const mergedFeatures = { ...(fb.translatedFeatures ?? {}), ...(base.translatedFeatures as object ?? {}) };
  return {
    ...base,
    translations: mergedTranslations,
    translatedFeatures: mergedFeatures,
    contentPages: hasContentPages(payload)
      ? base.contentPages
      : publicSiteDevFallback.contentPages,
  };
}

export async function GET() {
  try {
    const res = await fetch(`${getMyframeApiBase()}/api/public/site`, { cache: "no-store" });
    if (res.ok) {
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error(`Unexpected public site content type: ${contentType || "unknown"}`);
      }
      const payload = await res.json();
      return NextResponse.json(withFallbackMarketing(payload), {
        status: res.status,
        headers: { "cache-control": "no-store" },
      });
    }
  } catch (e) {
    console.warn("[api/public/site] upstream unreachable; serving bundled fallback", e);
  }
  return NextResponse.json(publicSiteDevFallback, {
    status: 200,
    headers: { "cache-control": "no-store" },
  });
}
