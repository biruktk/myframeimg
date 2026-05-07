import { NextResponse } from "next/server";
import { USER_EMAIL_COOKIE, USER_ID_COOKIE, USER_NAME_COOKIE, USER_TOKEN_COOKIE } from "@/lib/user-auth";

export async function POST() {
  const out = NextResponse.json({ ok: true });
  const opts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 };
  out.cookies.set(USER_TOKEN_COOKIE, "", opts);
  out.cookies.set(USER_ID_COOKIE, "", opts);
  out.cookies.set(USER_EMAIL_COOKIE, "", opts);
  out.cookies.set(USER_NAME_COOKIE, "", opts);
  return out;
}
