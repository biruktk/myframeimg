import { NextRequest, NextResponse } from "next/server";
import { getMyframeApiBase } from "@/lib/backend-url";

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const token = req.headers.get("authorization") ?? "";
    const body = await req.text();
    const res = await fetch(`${getMyframeApiBase()}/api/invite/${encodeURIComponent(code)}/bind-account`, {
      method: "POST",
      cache: "no-store",
      headers: {
        authorization: token,
        "content-type": "application/json",
      },
      body,
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
