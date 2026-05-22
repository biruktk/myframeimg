import { NextResponse } from "next/server";
import { cookies } from "next/headers";

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

export async function POST() {
  try {
    const res = await fetch(`${getMyframeApiBase()}/api/auth/test-login`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: "{}",
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
      let body: Record<string, unknown> = { ok: false, error: "test_login_failed" };
      try {
        body = JSON.parse(text) as Record<string, unknown>;
      } catch {
        if (text.trim()) body = { ok: false, error: "test_login_failed", message: text.slice(0, 200) };
      }
      if (res.status >= 500 || res.status === 503) {
        body.message ??= `Cannot reach API at ${getMyframeApiBase()}. On the VPS: pm2 restart myframe-api`;
      }
      return NextResponse.json(body, { status: res.status >= 400 ? res.status : 502 });
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : "backend_unreachable";
    return NextResponse.json(
      {
        ok: false,
        error: "backend_unreachable",
        message: `Cannot reach API at ${getMyframeApiBase()}. Start it with: cd web/backend && npm run dev`,
        detail: msg,
      },
      { status: 503 },
    );
  }
}
