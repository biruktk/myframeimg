import { cache } from "react";
import { headers } from "next/headers";

export type MarketingMenuItem = {
  label: string;
  url: string;
  target?: string;
  menu_order?: number;
};

export type MarketingPublicSitePayload = {
  basic?: { headerLogo?: string; siteTitle?: string; themeColor?: string };
  menus?: MarketingMenuItem[];
  languages?: Array<{ code: string; name?: string; native_name?: string }>;
  translations?: Record<string, Record<string, string>>;
  contentPages?: Record<string, Record<string, { title?: string; body?: string; excerpt?: string }>>;
};

export const fetchMarketingPublicSite = cache(async (): Promise<MarketingPublicSitePayload | null> => {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return null;
    const rawProto = h.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const proto =
      rawProto ||
      (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    const res = await fetch(`${proto}://${host}/api/public/site`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as MarketingPublicSitePayload;
  } catch {
    return null;
  }
});
