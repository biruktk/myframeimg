import fs from "fs";
import path from "path";

import { NextResponse } from "next/server";

const MDM_ROOT = path.join(process.cwd(), "mdm");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

export function mdmAssetPath(segments: string[]): string | null {
  const safe = segments.filter((s) => s && s !== "." && s !== "..");
  const rel = safe.length ? safe.join("/") : "index.html";
  const filePath = path.join(MDM_ROOT, rel);
  if (!filePath.startsWith(MDM_ROOT)) return null;
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
  return filePath;
}

export function mdmAssetResponse(segments: string[]): NextResponse {
  const filePath = mdmAssetPath(segments);
  if (!filePath) {
    return NextResponse.json({ ok: false, error: "mdm_asset_not_found" }, { status: 404 });
  }
  const ext = path.extname(filePath).toLowerCase();
  const body = fs.readFileSync(filePath);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": MIME[ext] ?? "application/octet-stream",
      "cache-control": ext === ".html" ? "no-store" : "public, max-age=300",
    },
  });
}
