import { NextResponse } from "next/server";

import { getMyframeApiBase } from "@/lib/backend-url";
import { defaultBlogPosts, publishedBlogs } from "@/lib/blogs";

export async function GET() {
  try {
    const res = await fetch(`${getMyframeApiBase()}/api/public/blogs`, { cache: "no-store" });
    if (res.ok) {
      const text = await res.text();
      return new NextResponse(text, {
        status: res.status,
        headers: {
          "content-type": res.headers.get("content-type") ?? "application/json",
          "cache-control": "no-store",
        },
      });
    }
  } catch {
    /* fall back below */
  }
  return NextResponse.json(publishedBlogs(defaultBlogPosts), { headers: { "cache-control": "no-store" } });
}
