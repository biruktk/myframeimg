import { NextRequest, NextResponse } from "next/server";
import { getMyframeApiBase, myframeBackendAdminHeaders } from "@/lib/backend-url";

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.toString();
    const path = q ? `/api/admin/users?${q}` : "/api/admin/users";
    const res = await fetch(`${getMyframeApiBase()}${path}`, {
      cache: "no-store",
      headers: { ...myframeBackendAdminHeaders() },
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "admin_users_proxy_failed" },
      { status: 502 },
    );
  }
}
