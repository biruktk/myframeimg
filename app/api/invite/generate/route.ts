import { NextRequest, NextResponse } from "next/server";
import { getMyframeApiBase } from "@/lib/backend-url";
import { getUserToken } from "@/lib/user-auth";

export async function GET(req: NextRequest) {
  try {
    const frameMac = req.nextUrl.searchParams.get("frameMac") ?? "";
    if (!frameMac) {
      return NextResponse.json({ ok: false, error: "missing_frameMac" }, { status: 400 });
    }
    const token = getUserToken(req);
    const headers: Record<string, string> = { accept: "application/json" };
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${getMyframeApiBase()}/api/invite/generate?frameMac=${encodeURIComponent(frameMac)}`, {
      cache: "no-store",
      headers,
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
