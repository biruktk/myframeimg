import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getMyframeApiBase, myframeBackendAdminHeaders } from "@/lib/backend-url";
import { adminTokenOrUnauthorized } from "@/lib/admin-route-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = adminTokenOrUnauthorized(req);
  if (auth.response) return auth.response;

  const qs = req.nextUrl.search;
  const url = `${getMyframeApiBase()}/api/devs/logs${qs}`;

  try {
    const res = await fetch(url, {
      headers: myframeBackendAdminHeaders(auth.token ?? undefined),
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "devs_logs_proxy_failed" },
      { status: 502 },
    );
  }
}
