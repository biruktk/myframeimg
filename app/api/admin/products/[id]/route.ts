import { NextRequest, NextResponse } from "next/server";

import { getMyframeApiBase, myframeBackendAdminHeaders } from "@/lib/backend-url";
import { adminTokenOrUnauthorized } from "@/lib/admin-route-auth";

type Props = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Props) {
  const auth = adminTokenOrUnauthorized(req);
  if (auth.response) return auth.response;
  const { id } = await params;
  try {
    const body = await req.text();
    const res = await fetch(`${getMyframeApiBase()}/api/admin/products/${encodeURIComponent(id)}`, {
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
      { ok: false, error: e instanceof Error ? e.message : "admin_products_update_proxy_failed" },
      { status: 502 },
    );
  }
}

export async function DELETE(req: NextRequest, { params }: Props) {
  const auth = adminTokenOrUnauthorized(req);
  if (auth.response) return auth.response;
  const { id } = await params;
  try {
    const res = await fetch(`${getMyframeApiBase()}/api/admin/products/${encodeURIComponent(id)}`, {
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
      { ok: false, error: e instanceof Error ? e.message : "admin_products_delete_proxy_failed" },
      { status: 502 },
    );
  }
}
