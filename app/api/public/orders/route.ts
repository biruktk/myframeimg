import { NextRequest, NextResponse } from "next/server";

import { getMyframeApiBase } from "@/lib/backend-url";

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const res = await fetch(`${getMyframeApiBase()}/api/public/orders`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body,
      cache: "no-store",
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "public_orders_proxy_failed" },
      { status: 502 },
    );
  }
}
