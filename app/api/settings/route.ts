import { NextRequest, NextResponse } from "next/server";
import { getMyframeApiBase, myframeBackendAdminHeaders } from "@/lib/backend-url";

export async function GET() {
  const base = getMyframeApiBase();
  try {
    const res = await fetch(`${base}/api/settings`, { cache: "no-store" });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "settings_proxy_failed" },
      { status: 502 },
    );
  }
}

export async function PUT(req: NextRequest) {
  const base = getMyframeApiBase();
  const section = req.nextUrl.searchParams.get("section");
  if (!section) {
    return NextResponse.json({ ok: false, error: "missing_section" }, { status: 400 });
  }
  const allowed = new Set(["account", "notifications", "preferences", "integrations"]);
  if (!allowed.has(section)) {
    return NextResponse.json({ ok: false, error: "invalid_section" }, { status: 400 });
  }
  try {
    const body = await req.json();
    const res = await fetch(`${base}/api/settings/${section}`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        ...myframeBackendAdminHeaders(),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "settings_update_failed" },
      { status: 502 },
    );
  }
}
