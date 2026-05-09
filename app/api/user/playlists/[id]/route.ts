import { NextRequest, NextResponse } from "next/server";

import { getMyframeApiBase } from "@/lib/backend-url";
import { getUserToken } from "@/lib/user-auth";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const token = getUserToken(req);
  if (!token) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  try {
    const body = await req.text();
    const res = await fetch(`${getMyframeApiBase()}/api/user/playlists/${encodeURIComponent(id)}`, {
      method: "PATCH",
      cache: "no-store",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
      body,
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "playlist_patch_proxy_failed" },
      { status: 502 },
    );
  }
}
