import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { geoLocationFallback, lookupGeoFromRequest } from "@/lib/geo-location";
import { getMyframeApiBase } from "@/lib/backend-url";

export async function GET(request: NextRequest) {
  const acceptLanguage = request.headers.get("accept-language") ?? "";
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "";

  try {
    const upstreamHeaders = new Headers({ accept: "application/json" });
    if (ip) {
      upstreamHeaders.set("x-forwarded-for", ip);
      upstreamHeaders.set("x-real-ip", ip);
    }
    if (acceptLanguage) upstreamHeaders.set("accept-language", acceptLanguage);

    const res = await fetch(`${getMyframeApiBase()}/api/public/location`, {
      cache: "no-store",
      headers: upstreamHeaders,
    });
    if (res.ok) {
      const text = await res.text();
      return new NextResponse(text, {
        status: res.status,
        headers: {
          "content-type": res.headers.get("content-type") ?? "application/json",
          "cache-control": "no-store",
        },
      });
    }
  } catch (e) {
    console.warn("[api/public/location] upstream unreachable; using inline geo lookup", e);
  }

  try {
    const geo = await lookupGeoFromRequest(request);
    return NextResponse.json(geo, {
      status: 200,
      headers: { "cache-control": "no-store" },
    });
  } catch (e) {
    console.warn("[api/public/location] inline geo lookup failed", e);
    return NextResponse.json(geoLocationFallback(acceptLanguage), {
      status: 200,
      headers: { "cache-control": "no-store" },
    });
  }
}
