import fs from "fs";
import path from "path";

import { NextResponse } from "next/server";

/** Same pattern as `/admin`: HTML always loads; APIs require `myframe_admin_session` cookie via `/api/admin/session`. */
function manageHtmlPath(): string {
  return path.join(process.cwd(), "backend", "static", "manage.html");
}

export async function GET() {
  const p = manageHtmlPath();
  if (!fs.existsSync(p)) {
    return NextResponse.json({ ok: false, error: "manage_html_missing" }, { status: 404 });
  }
  const body = fs.readFileSync(p, "utf8");
  return new NextResponse(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
