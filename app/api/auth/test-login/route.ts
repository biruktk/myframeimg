import { NextResponse } from "next/server";
import { getMyframeApiBase } from "@/lib/backend-url";
import { USER_EMAIL_COOKIE, USER_ID_COOKIE, USER_NAME_COOKIE, USER_TOKEN_COOKIE } from "@/lib/user-auth";

export async function POST() {
  try {
    const res = await fetch(`${getMyframeApiBase()}/api/auth/test-login`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: "{}",
      cache: "no-store",
    });
    const text = await res.text();
    let parsed: any = null;
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
    const common = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 };
    out.cookies.set(USER_TOKEN_COOKIE, String(parsed.token), common);
    out.cookies.set(USER_ID_COOKIE, String(parsed.user.id ?? ""), common);
    out.cookies.set(USER_EMAIL_COOKIE, String(parsed.user.email ?? ""), common);
    out.cookies.set(USER_NAME_COOKIE, String(parsed.user.name ?? ""), common);
    return out;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }
}
