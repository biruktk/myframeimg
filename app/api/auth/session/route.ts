import { NextRequest, NextResponse } from "next/server";
import { USER_EMAIL_COOKIE, USER_ID_COOKIE, USER_NAME_COOKIE } from "@/lib/user-auth";
import { getUserToken } from "@/lib/user-auth";

export async function GET(req: NextRequest) {
  const token = getUserToken(req);
  if (!token) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({
    ok: true,
    user: {
      id: req.cookies.get(USER_ID_COOKIE)?.value ?? "",
      email: req.cookies.get(USER_EMAIL_COOKIE)?.value ?? "",
      name: req.cookies.get(USER_NAME_COOKIE)?.value ?? "",
    },
  });
}
