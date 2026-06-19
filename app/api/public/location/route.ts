import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { geoLocationFallback, lookupGeoFromRequest } from "@/lib/geo-location";
import { shippingEstimateForCountry } from "@/lib/shipping-estimate";

export const dynamic = "force-dynamic";

/** Edge geo lookup — uses nginx X-Forwarded-For on https://myframe.ink (no backend hop required). */
export async function GET(request: NextRequest) {
  const acceptLanguage = request.headers.get("accept-language") ?? "";

  try {
    const geo = await lookupGeoFromRequest(request);
    const shipping = shippingEstimateForCountry(geo.countryCode || "US");
    return NextResponse.json(
      { ...geo, shipping },
      {
        status: 200,
        headers: { "cache-control": "no-store, no-cache, must-revalidate" },
      },
    );
  } catch (e) {
    console.warn("[api/public/location] geo lookup failed", e);
    const fallback = geoLocationFallback(acceptLanguage);
    return NextResponse.json(
      { ...fallback, shipping: shippingEstimateForCountry(fallback.countryCode || "US") },
      {
        status: 200,
        headers: { "cache-control": "no-store" },
      },
    );
  }
}
