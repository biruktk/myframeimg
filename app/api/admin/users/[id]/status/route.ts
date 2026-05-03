import { NextRequest, NextResponse } from "next/server";
import { getMyframeApiBase, myframeBackendAdminHeaders } from "@/lib/backend-url";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const body = await req.text();
    const res = await fetch(`${getMyframeApiBase()}/api/admin/users/${encodeURIComponent(id)}/status`, {
      method: "POST",
      headers: { "content-type": "application/json", ...myframeBackendAdminHeaders() },
      body,
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "admin_user_status_proxy_failed" },
      { status: 502 },
    );
  }
}
