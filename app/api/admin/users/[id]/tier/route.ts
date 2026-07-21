import { NextRequest, NextResponse } from "next/server";
import { getMyframeApiBase, myframeBackendAdminHeaders } from "@/lib/backend-url";
import { adminTokenOrUnauthorized } from "@/lib/admin-route-auth";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = adminTokenOrUnauthorized(req);
  if (auth.response) return auth.response;
  const { id } = await ctx.params;
  try {
    const body = await req.text();
    const res = await fetch(`${getMyframeApiBase()}/api/admin/users/${encodeURIComponent(id)}/tier`, {
      method: "POST",
      headers: { "content-type": "application/json", ...myframeBackendAdminHeaders(auth.token ?? undefined) },
      body,
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "admin_user_tier_proxy_failed" },
      { status: 502 },
    );
  }
}
