import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getMyframeApiBase, myframeBackendAdminHeaders } from "@/lib/backend-url";
import { adminTokenOrUnauthorized } from "@/lib/admin-route-auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path?: string[] }> };

async function proxyToExpress(req: NextRequest, segments: string[]) {
  const auth = adminTokenOrUnauthorized(req);
  if (auth.response) return auth.response;

  const path = segments.map((s) => encodeURIComponent(s)).join("/");
  const qs = req.nextUrl.search;
  const url = `${getMyframeApiBase()}/api/admin/${path}${qs}`;
  const method = req.method.toUpperCase();

  const onward = new Headers();
  const accept = req.headers.get("accept");
  if (accept) onward.set("accept", accept);
  for (const [k, v] of Object.entries(myframeBackendAdminHeaders(auth.token ?? undefined))) onward.set(k, v);

  let body: BodyInit | undefined;

  if (method !== "GET" && method !== "HEAD") {
    const ctIn = req.headers.get("content-type");
    if (ctIn?.includes("multipart/form-data")) {
      onward.set("content-type", ctIn);
      body = req.body ?? undefined;
    } else if (ctIn) {
      onward.set("content-type", ctIn);
    } else if (method === "DELETE" || method === "PATCH" || method === "PUT") {
      onward.set("content-type", "application/json");
    }
    if (!(ctIn ?? "").includes("multipart/form-data")) {
      const t = await req.text();
      body = t.length ? t : method === "DELETE" ? "{}" : undefined;
    }
  }

  try {
    const res = await fetch(url, {
      method,
      headers: onward,
      body,
      cache: "no-store",
      duplex: "half",
    } as RequestInit & { duplex?: string });

    const ct = res.headers.get("content-type") ?? "application/octet-stream";
    const bin = await res.arrayBuffer();
    return new NextResponse(bin, { status: res.status, headers: { "content-type": ct } });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "admin_forward_failed" },
      { status: 502 },
    );
  }
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  if (!path?.length) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return proxyToExpress(req, path);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  if (!path?.length) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return proxyToExpress(req, path);
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  if (!path?.length) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return proxyToExpress(req, path);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  if (!path?.length) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return proxyToExpress(req, path);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  if (!path?.length) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return proxyToExpress(req, path);
}
