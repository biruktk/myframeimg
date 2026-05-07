import { NextRequest, NextResponse } from "next/server";
import { getMyframeApiBase } from "@/lib/backend-url";
import { getUserToken } from "@/lib/user-auth";

export async function GET(req: NextRequest) {
  const token = getUserToken(req);
  if (!token) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  try {
    const res = await fetch(`${getMyframeApiBase()}/api/enterprise/self/profile`, {
      cache: "no-store",
      headers: { authorization: `Bearer ${token}` },
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "enterprise_profile_proxy_failed" }, { status: 502 });
  }
}
