import { NextRequest, NextResponse } from "next/server";
import { ADMIN_TOKEN, getAdminTokenFromRequest } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  const token = getAdminTokenFromRequest(req);
  return NextResponse.json({ ok: token === ADMIN_TOKEN });
}
