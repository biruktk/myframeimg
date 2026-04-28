import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    appName: "MyFrame",
    message: "Backend API is now merged into the web project.",
  });
}
