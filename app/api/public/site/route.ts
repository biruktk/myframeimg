import { NextResponse } from "next/server";

import { getMyframeApiBase } from "@/lib/backend-url";

export async function GET() {
  try {
    const res = await fetch(`${getMyframeApiBase()}/api/public/site`, { cache: "no-store" });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "public_site_proxy_failed" },
      { status: 502 },
    );
  }
}
