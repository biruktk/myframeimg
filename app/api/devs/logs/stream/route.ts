import type { NextRequest } from "next/server";

import { getMyframeApiBase, myframeBackendAdminHeaders } from "@/lib/backend-url";
import { adminTokenOrUnauthorized } from "@/lib/admin-route-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = adminTokenOrUnauthorized(req);
  if (auth.response) return auth.response;

  const qs = req.nextUrl.search;
  const url = `${getMyframeApiBase()}/api/devs/logs/stream${qs}`;

  try {
    const upstream = await fetch(url, {
      headers: {
        ...myframeBackendAdminHeaders(auth.token ?? undefined),
        accept: "text/event-stream",
      },
      cache: "no-store",
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text();
      return new Response(text || "stream_failed", { status: upstream.status });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      },
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "devs_stream_proxy_failed", { status: 502 });
  }
}
