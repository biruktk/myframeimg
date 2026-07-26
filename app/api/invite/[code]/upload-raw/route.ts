import { NextRequest, NextResponse } from "next/server";
import { getMyframeApiBase } from "@/lib/backend-url";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const body = await req.blob();
    const ct = req.headers.get("content-type") ?? "image/jpeg";
    const pairingToken = req.headers.get("x-pairing-token") ?? "";
    const apiUrl = `${getMyframeApiBase()}/api/invite/${encodeURIComponent(code)}/upload-raw`;
    const headers: Record<string, string> = {
      "content-type": ct,
      accept: "application/json",
    };
    if (pairingToken) headers["x-pairing-token"] = pairingToken;
    const res = await fetch(apiUrl, {
      method: "POST",
      headers,
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