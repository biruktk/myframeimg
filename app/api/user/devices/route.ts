import { NextRequest, NextResponse } from "next/server";

import { getMyframeApiBase } from "@/lib/backend-url";
import { getUserToken } from "@/lib/user-auth";

export async function POST(req: NextRequest) {
  const token = getUserToken(req);
  if (!token) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.text();
    const res = await fetch(`${getMyframeApiBase()}/api/user/devices`, {
      method: "POST",
      cache: "no-store",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body,
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "backend_unreachable",
        message: `Cannot reach API at ${getMyframeApiBase()}. Ensure the API is running (pm2 restart myframe-api).`,
        detail: e instanceof Error ? e.message : String(e),
      },
      { status: 503 },
    );
  }
}
