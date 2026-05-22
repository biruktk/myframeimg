import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { setAuthSessionCookies } from "@/lib/auth-session";
import { getMyframeApiBase } from "@/lib/backend-url";

type AuthResponse = {
  token?: unknown;
  user?: {
    id?: unknown;
    email?: unknown;
    name?: unknown;
  };
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(`${getMyframeApiBase()}/api/auth/register`, {
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
        headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
      });
    }
    const out = NextResponse.json({ ok: true, user: parsed.user });
    const jar = await cookies();
    setAuthSessionCookies(jar, {
      token: String(parsed.token),
      user: {
        id: String(parsed.user.id),
        email: String(parsed.user.email ?? ""),
        name: String(parsed.user.name ?? "User"),
      },
    });
    return out;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }
}
