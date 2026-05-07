import { NextRequest, NextResponse } from "next/server";
import { ADMIN_TOKEN, getAdminTokenFromRequest } from "@/lib/admin-auth";

export function adminTokenOrUnauthorized(req: NextRequest): { token: string | null; response: NextResponse | null } {
  const token = getAdminTokenFromRequest(req);
  if (token !== ADMIN_TOKEN) {
    return {
      token: null,
      response: NextResponse.json({ ok: false, error: "admin_auth_required" }, { status: 401 }),
    };
  }
  return { token, response: null };
}
