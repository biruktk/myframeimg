import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Legacy CMS URL → canonical `/admin`. */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/admin";
  return NextResponse.redirect(url, 308);
}
