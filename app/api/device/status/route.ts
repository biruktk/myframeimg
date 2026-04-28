import { NextResponse } from "next/server";

import { getMyframeApiBase } from "@/lib/backend-url";
import type { DeviceStatusPayload } from "@/lib/device-status";

export async function GET() {
  try {
    const url = `${getMyframeApiBase()}/api/device/status`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      const text = await res.text();
      return new NextResponse(text || JSON.stringify({ ok: false, error: "upstream_error" }), {
        status: res.status,
        headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
      });
    }
    const data = (await res.json()) as DeviceStatusPayload;
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "status_proxy_failed" },
      { status: 502 },
    );
  }
}
