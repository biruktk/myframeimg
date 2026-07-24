import { NextRequest, NextResponse } from "next/server";
import { getMyframeApiBase } from "@/lib/backend-url";

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const res = await fetch(`${getMyframeApiBase()}/api/invite/${encodeURIComponent(code)}/qr`, {
      cache: "no-store",
    });
    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "image/png",
        "cache-control": res.headers.get("cache-control") ?? "public, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "proxy_failed" }, { status: 502 });
  }
}
