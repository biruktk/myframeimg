import { NextRequest, NextResponse } from "next/server";

import { getMyframeApiBase } from "@/lib/backend-url";

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.search;
  try {
    const res = await fetch(`${getMyframeApiBase()}/api/public/shipping-estimate${qs}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "shipping_estimate_proxy_failed" },
      { status: 502 },
    );
  }
}
