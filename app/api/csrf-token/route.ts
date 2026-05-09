import { NextResponse } from "next/server";

/** manage.html sends this header on mutations; Express admin does not enforce CSRF. */
export async function GET() {
  return NextResponse.json({ csrfToken: "" });
}
