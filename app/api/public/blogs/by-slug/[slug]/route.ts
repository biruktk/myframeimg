import { NextResponse } from "next/server";

import { getMyframeApiBase } from "@/lib/backend-url";
import { defaultBlogPosts } from "@/lib/blogs";

type Props = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Props) {
  const { slug } = await params;
  try {
    const res = await fetch(`${getMyframeApiBase()}/api/public/blogs/by-slug/${encodeURIComponent(slug)}`, {
      cache: "no-store",
    });
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

  const post = defaultBlogPosts.find((item) => item.slug === slug && item.status === "publish");
  if (!post) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json(
    {
      ...post,
      meta_title_pub: post.meta_title,
      meta_description_pub: post.meta_description,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
