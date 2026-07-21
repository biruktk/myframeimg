import { NextRequest, NextResponse } from "next/server";
import { getMyframeApiBase } from "@/lib/backend-url";
import { getUserToken } from "@/lib/user-auth";

export async function POST(req: NextRequest) {
  const token = getUserToken(req);
  if (!token) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  try {
    const body = await req.text();
    const res = await fetch(`${getMyframeApiBase()}/api/enterprise/self/api-key`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body,
      cache: "no-store",
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "enterprise_key_proxy_failed" }, { status: 502 });
  }
}
