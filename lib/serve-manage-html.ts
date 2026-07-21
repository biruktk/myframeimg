import fs from "fs";
import path from "path";

import { NextResponse } from "next/server";

/** Path to the CMS/manage SPA consumed by `/admin`. */
export function manageHtmlPath(): string {
  return path.join(process.cwd(), "backend", "static", "manage.html");
}

export function manageHtmlResponse(): NextResponse {
  const filePath = manageHtmlPath();
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ ok: false, error: "manage_html_missing" }, { status: 404 });
  }
  const body = fs.readFileSync(filePath, "utf8");
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
