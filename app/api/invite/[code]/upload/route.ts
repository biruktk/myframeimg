import { NextRequest, NextResponse } from "next/server";
import { getMyframeApiBase } from "@/lib/backend-url";

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const body = await req.blob();
    const ct = req.headers.get("content-type") ?? "multipart/form-data";
    const apiUrl = `${getMyframeApiBase()}/api/invite/${encodeURIComponent(code)}/upload`;
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "content-type": ct,
        accept: "application/json",
      },
      body,
      cache: "no-store",
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json({ ok: false, error: "proxy_failed" }, { status: 502 });
  }
}
