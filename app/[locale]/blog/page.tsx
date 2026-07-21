import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { getMyframeApiBase } from "@/lib/backend-url";
import { defaultBlogPosts, publishedBlogs, type BlogPost } from "@/lib/blogs";
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n";
import { fetchMarketingPublicSite } from "@/lib/marketing-public-site-server";

import "./blog.css";

type Props = { params: Promise<{ locale: string }> };

async function getBlogs(): Promise<BlogPost[]> {
  try {
    const res = await fetch(`${getMyframeApiBase()}/api/public/blogs`, { cache: "no-store" });
    if (res.ok) {
      const parsed = (await res.json()) as BlogPost[];
      if (Array.isArray(parsed) && parsed.length) return publishedBlogs(parsed);
    }
  } catch {
    /* fall back below */
  }
  return publishedBlogs(defaultBlogPosts);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : defaultLocale;
  const site = await fetchMarketingPublicSite();
  const page = site?.contentPages?.[locale]?.blog ?? site?.contentPages?.en?.blog;
  return {
    title: `${page?.title?.trim() || "Blog"} | MyFrame`,
    description: page?.excerpt?.trim() || "Stories, updates and product notes from the MyFrame team.",
    alternates: { canonical: locale === defaultLocale ? "/blog" : `/${locale}/blog` },
    robots: { index: true, follow: true },
  };
}

export default async function BlogPage({ params }: Props) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : defaultLocale;
  const site = await fetchMarketingPublicSite();
  const page = site?.contentPages?.[locale]?.blog ?? site?.contentPages?.en?.blog;
  const translated = locale === defaultLocale ? {} : site?.translations?.[locale] ?? {};
  const logo = site?.basic?.headerLogo?.trim() || "/assets/myframe-logo-final.svg";
  const home = locale === defaultLocale ? "/" : `/${locale}`;
  const prefix = locale === defaultLocale ? "/blog" : `/${locale}/blog`;
  const blogs = await getBlogs();

  return (
    <div className="blog-page">
      <nav className="blog-nav">
        <div className="blog-nav-shell">
          <Link href={home}>
            <Image className="blog-brand-logo" src={logo} alt="MyFrame" width={220} height={58} />
          </Link>
          <Link className="blog-back" href={home}>
            {translated.successBackHome || "Back to MyFrame"}
          </Link>
        </div>
      </nav>
      <main className="blog-page-main">
        <div className="blog-eyebrow">MyFrame</div>
        <h1 className="blog-title">{page?.title || "Blog"}</h1>
        <p className="blog-lede">
          {page?.excerpt || "Stories, updates and product notes from the MyFrame team."}
        </p>
        <section className="blog-grid">
          {blogs.map((blog) => (
            <article className="blog-card" key={blog.slug}>
              <Link className="blog-card-link" href={`${prefix}/${blog.slug}`}>
                {blog.featured_image ? (
                  <div className="blog-thumb">
                    <Image src={blog.featured_image} alt="" width={720} height={450} />
                  </div>
                ) : null}
                <h2>{blog.title}</h2>
                <div className="blog-meta">{new Date(blog.created_at).toLocaleDateString()}</div>
                <p className="blog-excerpt">{blog.excerpt}</p>
                <span className="blog-read">
                  Read article <i className="fas fa-arrow-right" />
                </span>
              </Link>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
