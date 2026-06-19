import type { NextRequest } from "next/server";

import { mdmAssetResponse } from "@/lib/serve-mdm";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path?: string[] }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return mdmAssetResponse(path ?? []);
}
