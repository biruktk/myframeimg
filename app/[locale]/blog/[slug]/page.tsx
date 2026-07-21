import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getMyframeApiBase } from "@/lib/backend-url";
import { defaultBlogPosts, type BlogPost } from "@/lib/blogs";
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n";
import { fetchMarketingPublicSite } from "@/lib/marketing-public-site-server";

import "./blog-post.css";

type Props = { params: Promise<{ locale: string; slug: string }> };

async function getBlog(slug: string): Promise<BlogPost | null> {
  try {
    const res = await fetch(`${getMyframeApiBase()}/api/public/blogs/by-slug/${encodeURIComponent(slug)}`, {
      cache: "no-store",
    });
    if (res.ok) return (await res.json()) as BlogPost;
  } catch {
    /* fall back below */
  }
  return defaultBlogPosts.find((post) => post.slug === slug && post.status === "publish") ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlog(slug);
  if (!post) return {};
  return {
    title: post.meta_title || `${post.title} | MyFrame`,
    description: post.meta_description || post.excerpt,
    openGraph: {
      title: post.meta_title || post.title,
      description: post.meta_description || post.excerpt,
      type: "article",
      images: post.featured_image ? [post.featured_image] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { locale: raw, slug } = await params;
  const locale: Locale = isLocale(raw) ? raw : defaultLocale;
  const post = await getBlog(slug);
  if (!post) notFound();

  const site = await fetchMarketingPublicSite();
  const logo = site?.basic?.headerLogo?.trim() || "/assets/myframe-logo-final.svg";
  const home = locale === defaultLocale ? "/" : `/${locale}`;
  const blogBase = locale === defaultLocale ? "/blog" : `/${locale}/blog`;

  return (
    <div className="blog-post-page">
      <nav className="blog-post-nav">
        <div className="blog-post-nav-shell">
          <Link href={home}>
            <Image className="blog-post-logo" src={logo} alt="MyFrame" width={220} height={58} />
          </Link>
          <Link className="blog-post-nav-a" href={blogBase}>
            <i className="fas fa-arrow-left" /> All posts
          </Link>
        </div>
      </nav>
      <main className="blog-post-wrap">
        <article>
          <p className="blog-post-eyebrow">MyFrame journal</p>
          <h1 className="blog-post-title">{post.title}</h1>
          <p className="blog-post-meta">
            {new Date(post.created_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
          {post.featured_image ? (
            <figure className="blog-post-feat">
              <Image src={post.featured_image} alt={post.title} width={1200} height={750} />
            </figure>
          ) : null}
          <div className="article-prose" dangerouslySetInnerHTML={{ __html: post.body }} />
        </article>
      </main>
    </div>
  );
}
