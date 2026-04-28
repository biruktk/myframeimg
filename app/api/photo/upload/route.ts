import { NextRequest, NextResponse } from "next/server";

import { getMyframeApiBase } from "@/lib/backend-url";

/**
 * Proxies multipart uploads to the Express server (`server/`) so the web app
 * uses the same `POST /api/photo/upload` contract as the Flutter app.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const url = `${getMyframeApiBase()}/api/photo/upload`;
    const res = await fetch(url, {
      method: "POST",
      body: formData,
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "proxy_failed",
      },
      { status: 502 },
    );
  }
}
