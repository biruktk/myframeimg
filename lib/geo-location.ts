import type { NextRequest } from "next/server";

import { geoLocationFallback, getClientIpFromHeaders, lookupGeoByIp } from "./geo-lookup";
import type { GeoLocationResult } from "./geo-lookup";
import type { Locale } from "./i18n";

export type { GeoLocationResult };

export function getClientIpFromRequest(request: NextRequest): string {
  return getClientIpFromHeaders(request.headers);
}

export async function lookupGeoFromRequest(request: NextRequest): Promise<GeoLocationResult & { recommendedLanguage: Locale }> {
  const ip = getClientIpFromRequest(request);
  const acceptLanguage = request.headers.get("accept-language") ?? "";
  const geo = await lookupGeoByIp(ip, acceptLanguage);
  return geo as GeoLocationResult & { recommendedLanguage: Locale };
}

export { geoLocationFallback, getClientIpFromHeaders, lookupGeoByIp };
