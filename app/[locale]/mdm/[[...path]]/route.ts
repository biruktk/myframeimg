import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Locale-prefixed /en/mdm → /mdm (MDM is locale-agnostic). */
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path?: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  const rest = (path ?? []).join("/");
  const target = rest ? `/mdm/${rest}` : "/mdm";
  const url = req.nextUrl.clone();
  url.pathname = target;
  return NextResponse.redirect(url);
}
