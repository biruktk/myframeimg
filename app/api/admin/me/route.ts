import { NextRequest, NextResponse } from "next/server";

import { ADMIN_USER, getAdminTokenFromRequest, ADMIN_TOKEN } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const tok = getAdminTokenFromRequest(req);
  if (tok !== ADMIN_TOKEN) {
    return NextResponse.json({ ok: false, error: "admin_auth_required" }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    admin: {
      id: 1,
      email: ADMIN_USER.includes("@") ? ADMIN_USER : `${ADMIN_USER}@myframe.local`,
      name: "Administrator",
      username: ADMIN_USER,
      role: "super_admin",
    },
  });
}
