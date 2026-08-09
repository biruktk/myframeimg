import { FamilyJoinView } from "@/components/frame/family-join-view";
import type { Metadata } from "next";
import type { Locale } from "@/lib/i18n";
import { getSiteUrl } from "@/lib/seo";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string; lang?: string }>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { lang } = await searchParams;
  const zh = lang !== "en";
  const title = zh
    ? "加入我的 MyFrame 艺术相框家庭"
    : "Join my MyFrame Family";
  const description = zh
    ? "通过邀请链接加入我的 MyFrame 家庭艺术相框，一起分享精彩照片。"
    : "Join my MyFrame family art frame and share beautiful photos together.";
  const url = `${getSiteUrl()}/join`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "MyFrame",
      locale: zh ? "zh_CN" : "en_US",
      type: "website",
      images: [
        { url: "/assets/share-cover.jpg", width: 800, height: 533, alt: "MyFrame" },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/assets/share-cover.jpg"],
    },
  };
}

export default async function FamilyJoinPage({ params, searchParams }: Props) {
  // Invite / join landings always show Simplified Chinese (match share sheets).
  void params;
  const locale: Locale = "zh";
  const { code: rawCode } = await searchParams;
  const code = String(rawCode ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  return <FamilyJoinView locale={locale} code={code} />;
}
