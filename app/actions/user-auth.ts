"use server";

import { cookies } from "next/headers";

import { getMyframeApiBase } from "@/lib/backend-url";
import { setAuthSessionCookies, type AuthTokenPayload } from "@/lib/auth-session";

export type AuthActionResult = { ok: true } | { ok: false; error: string; message?: string };

async function fetchAuth(path: string, body?: Record<string, unknown>): Promise<AuthActionResult> {
  const base = getMyframeApiBase();
  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body ?? {}),
      cache: "no-store",
    });
    const text = await res.text();
    type AuthJson = {
      ok?: boolean;
      token?: string;
      user?: AuthTokenPayload["user"];
      error?: string;
      message?: string;
    };
    let parsed: AuthJson | null = null;
    try {
      parsed = JSON.parse(text) as AuthJson;
    } catch {
      parsed = null;
    }
    if (!res.ok || !parsed?.token || !parsed?.user?.id) {
      return {
        ok: false,
        error: String(parsed?.error ?? "auth_failed"),
        message:
          parsed?.message ??
          (res.status >= 500
            ? `API at ${base} is not responding. On the VPS: pm2 restart myframe-api`
            : text.slice(0, 200) || undefined),
      };
    }
    const store = await cookies();
    setAuthSessionCookies(store, {
      token: String(parsed.token),
      user: {
        id: String(parsed.user.id),
        email: String(parsed.user.email ?? ""),
        name: String(parsed.user.name ?? "User"),
      },
    });
    return { ok: true };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: "backend_unreachable",
      message: `Cannot reach API at ${base}. (${detail})`,
    };
  }
}

/** Works on myframe.ink even when nginx proxies /api/* to Express — sets cookies via Next server. */
export async function testLoginAction(): Promise<AuthActionResult> {
  return fetchAuth("/api/auth/test-login");
}

export async function loginAction(email: string, password: string): Promise<AuthActionResult> {
  return fetchAuth("/api/auth/login", { email: email.trim(), password });
}

export async function registerAction(
  name: string,
  email: string,
  password: string,
): Promise<AuthActionResult> {
  return fetchAuth("/api/auth/register", { name: name.trim(), email: email.trim(), password });
}
