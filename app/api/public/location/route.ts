import { NextResponse } from "next/server";

import { getMyframeApiBase } from "@/lib/backend-url";

const LOCATION_FALLBACK = {
  ok: true,
  recommendedLanguage: "en",
  recommendedCurrency: "USD",
  country: "",
  city: "",
};

export async function GET() {
  try {
    const res = await fetch(`${getMyframeApiBase()}/api/public/location`, { cache: "no-store" });
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
    console.warn("[api/public/location] upstream unreachable; serving stub", e);
  }
  return NextResponse.json(LOCATION_FALLBACK, {
    status: 200,
    headers: { "cache-control": "no-store" },
  });
}
