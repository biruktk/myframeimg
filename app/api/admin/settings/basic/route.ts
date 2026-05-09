import { NextRequest, NextResponse } from "next/server";

import { getMyframeApiBase, myframeBackendAdminHeaders } from "@/lib/backend-url";
import { adminTokenOrUnauthorized } from "@/lib/admin-route-auth";

export async function PUT(req: NextRequest) {
  const auth = adminTokenOrUnauthorized(req);
  if (auth.response) return auth.response;
  try {
    const body = await req.text();
    const res = await fetch(`${getMyframeApiBase()}/api/admin/settings/basic`, {
      method: "PUT",
      headers: { "content-type": "application/json", ...myframeBackendAdminHeaders(auth.token ?? undefined) },
      body,
      cache: "no-store",
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "admin_settings_basic_proxy_failed" },
      { status: 502 },
    );
  }
}
