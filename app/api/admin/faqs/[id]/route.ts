import { NextRequest, NextResponse } from "next/server";
import { getMyframeApiBase } from "@/lib/backend-url";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const body = await req.text();
    const res = await fetch(`${getMyframeApiBase()}/api/admin/faqs/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body,
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "admin_faq_update_proxy_failed" },
      { status: 502 },
    );
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const res = await fetch(`${getMyframeApiBase()}/api/admin/faqs/${id}`, {
      method: "DELETE",
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "admin_faq_delete_proxy_failed" },
      { status: 502 },
    );
  }
}
