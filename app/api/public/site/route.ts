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

function withFallbackContentPages(payload: unknown) {
  if (!payload || typeof payload !== "object") return publicSiteDevFallback;
  if (hasContentPages(payload)) return payload;
  return {
    ...(payload as Record<string, unknown>),
    contentPages: publicSiteDevFallback.contentPages,
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
      return NextResponse.json(withFallbackContentPages(payload), {
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
