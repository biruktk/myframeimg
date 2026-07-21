import { NextRequest, NextResponse } from "next/server";

import { getMyframeApiBase } from "@/lib/backend-url";
import { getUserToken } from "@/lib/user-auth";

/** Alias for portal: same payload as `/api/home/dashboard`. */
export async function GET(req: NextRequest) {
  const token = getUserToken(req);
  if (!token) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const res = await fetch(`${getMyframeApiBase()}/api/user/dashboard`, {
      cache: "no-store",
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "home_proxy_failed" },
      { status: 502 },
    );
  }
}
