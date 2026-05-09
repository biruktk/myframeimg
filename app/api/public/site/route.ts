import { NextResponse } from "next/server";

import publicSiteDevFallback from "../../../../fixtures/public-site-dev-fallback.json";
import { getMyframeApiBase } from "@/lib/backend-url";

export async function GET() {
  try {
    const res = await fetch(`${getMyframeApiBase()}/api/public/site`, { cache: "no-store" });
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
    console.warn("[api/public/site] upstream unreachable; serving bundled fallback", e);
  }
  return NextResponse.json(publicSiteDevFallback, {
    status: 200,
    headers: { "cache-control": "no-store" },
  });
}
