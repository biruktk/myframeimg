import { NextRequest, NextResponse } from "next/server";

import { getMyframeApiBase, myframeBackendAdminHeaders } from "@/lib/backend-url";
import { adminTokenOrUnauthorized } from "@/lib/admin-route-auth";

type Props = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, { params }: Props) {
  const auth = adminTokenOrUnauthorized(req);
  if (auth.response) return auth.response;
  const { id } = await params;
  try {
    const res = await fetch(`${getMyframeApiBase()}/api/admin/subscribers/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { ...myframeBackendAdminHeaders(auth.token ?? undefined) },
      cache: "no-store",
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "admin_subscriber_delete_proxy_failed" },
      { status: 502 },
    );
  }
}
