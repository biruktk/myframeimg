import { NextRequest, NextResponse } from "next/server";

import { getMyframeApiBase, myframeBackendAdminHeaders } from "@/lib/backend-url";
import { adminTokenOrUnauthorized } from "@/lib/admin-route-auth";

export async function GET(req: NextRequest) {
  const auth = adminTokenOrUnauthorized(req);
  if (auth.response) return auth.response;
  try {
    const res = await fetch(`${getMyframeApiBase()}/api/admin/commerce/orders`, {
      cache: "no-store",
      headers: { ...myframeBackendAdminHeaders(auth.token ?? undefined) },
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "commerce_orders_proxy_failed" },
      { status: 502 },
    );
  }
}
