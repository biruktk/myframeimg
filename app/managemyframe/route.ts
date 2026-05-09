import { NextResponse } from "next/server";

import { getMyframeApiBase } from "@/lib/backend-url";

export async function GET(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  try {
    const res = await fetch(`${getMyframeApiBase()}/managemyframe`, {
      headers: { cookie, accept: request.headers.get("accept") || "text/html,*/*" },
      cache: "no-store",
    });
    const body = await res.text();
    const out = new NextResponse(body, { status: res.status });
    const ct = res.headers.get("content-type");
    if (ct) out.headers.set("content-type", ct);
    return out;
  } catch (e) {
    return new NextResponse(
      `Could not reach API at ${getMyframeApiBase()}: ${e instanceof Error ? e.message : String(e)}`,
      { status: 502, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }
}
