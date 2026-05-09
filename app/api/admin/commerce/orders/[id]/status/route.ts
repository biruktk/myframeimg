import { NextRequest, NextResponse } from "next/server";

import { getMyframeApiBase, myframeBackendAdminHeaders } from "@/lib/backend-url";
import { adminTokenOrUnauthorized } from "@/lib/admin-route-auth";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = adminTokenOrUnauthorized(req);
  if (auth.response) return auth.response;
  const { id } = await params;
  try {
    const body = await req.text();
    const res = await fetch(
      `${getMyframeApiBase()}/api/admin/commerce/orders/${encodeURIComponent(id)}/status`,
      {
        method: "PATCH",
        cache: "no-store",
        headers: {
          ...myframeBackendAdminHeaders(auth.token ?? undefined),
          "content-type": "application/json",
          accept: "application/json",
        },
        body,
      },
    );
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "order_status_proxy_failed" },
      { status: 502 },
    );
  }
}
