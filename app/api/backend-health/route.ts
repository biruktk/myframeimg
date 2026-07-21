import { NextResponse } from "next/server";

import { getMyframeApiBase } from "@/lib/backend-url";

/**
 * Returns whether the Express `server/` process answers `GET /health`.
 * Used by the web Settings screen (no secrets — base URL is configurable via env).
 */
export async function GET() {
  const base = getMyframeApiBase();
  try {
    const res = await fetch(`${base}/health`, { cache: "no-store" });
    const upstream = res.ok;
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return NextResponse.json({
      ok: true,
      upstream,
      base,
      upstreamBody: body,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      upstream: false,
      base,
      error: e instanceof Error ? e.message : "fetch_failed",
    });
  }
}
