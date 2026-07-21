import { NextResponse } from "next/server";
import { getMyframeApiBase } from "@/lib/backend-url";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const res = await fetch(`${getMyframeApiBase()}/api/device/send`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }
}
