import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { setAuthSessionCookies } from "@/lib/auth-session";
import { getMyframeApiBase } from "@/lib/backend-url";

export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization",
  "Access-Control-Max-Age": "86400",
} as const;

type AuthResponse = {
  token?: unknown;
  user?: {
    id?: unknown;
    email?: unknown;
    name?: unknown;
  };
};

/** CORS preflight (Flutter web / SPA); native Flutter typically skips OPTIONS. */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { ...corsHeaders } });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(`${getMyframeApiBase()}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const text = await res.text();
    let parsed: AuthResponse | null = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    if (!res.ok || !parsed?.token || !parsed?.user?.id) {
      return new NextResponse(text, {
        status: res.status,
        headers: {
          "content-type": res.headers.get("content-type") ?? "application/json",
          ...corsHeaders,
        },
      });
    }
    const tokenStr = String(parsed.token);
    const out = NextResponse.json({ ok: true, user: parsed.user, token: tokenStr });
    const jar = await cookies();
    setAuthSessionCookies(jar, {
      token: tokenStr,
      user: {
        id: String(parsed.user.id),
        email: String(parsed.user.email ?? ""),
        name: String(parsed.user.name ?? "User"),
      },
    });
    Object.entries(corsHeaders).forEach(([k, v]) => out.headers.set(k, v));
    return out;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400, headers: { ...corsHeaders } });
  }
}
