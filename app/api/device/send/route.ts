import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      source?: string;
      transport?: string;
      slideshow?: string;
    };

    return NextResponse.json({
      ok: true,
      message: `Queued: ${body.source ?? "photo"} via ${body.transport ?? "wifi"} (${body.slideshow ?? "fade"})`,
    });
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 });
  }
}
