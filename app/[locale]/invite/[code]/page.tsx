import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { InviteGuestView } from "@/components/frame/invite-guest-view";
import { isLocale, type Locale } from "@/lib/i18n";
import { getSiteUrl } from "@/lib/seo";

type Props = {
  params: Promise<{ locale: string; code: string }>;
  searchParams: Promise<{ lang?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { code: rawCode } = await params;
  const { lang } = await searchParams;
  const zh = lang !== "en";
  const code = String(rawCode ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const title = zh
    ? "发送照片到我的 MyFrame 艺术相框！"
    : "Send photos to my MyFrame art frame!";
  const description = zh
    ? "点击链接即可直接发送照片到我的 MyFrame 艺术相框，一起珍藏美好瞬间。"
    : "Tap the link to send photos straight to my MyFrame art frame and treasure the moments together.";
  const url = `${getSiteUrl()}/invite/${code}`;
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

const invalidCopy: Record<Locale, { title: string; body: string }> = {
  en: { title: "Invalid invite link", body: "This invite code is not valid." },
  zh: { title: "无效的邀请链接", body: "此邀请码无效。" },
  es: { title: "Enlace de invitación inválido", body: "Este código de invitación no es válido." },
  fr: { title: "Lien d'invitation invalide", body: "Ce code d'invitation n'est pas valide." },
  de: { title: "Ungültiger Einladungslink", body: "Dieser Einladungscode ist ungültig." },
  ja: { title: "無効な招待リンク", body: "この招待コードは無効です。" },
};

export default async function InviteGuestPage({ params }: Props) {
  const { locale: raw, code: rawCode } = await params;
  if (!isLocale(raw)) notFound();

  // Guest invite landing always Simplified Chinese (match share / QR cards).
  void raw;
  const locale: Locale = "zh";
  const code = String(rawCode ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (code.length !== 8) {
    const t = invalidCopy.zh;
    return (
      <main lang="zh" style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <h1>{t.title}</h1>
        <p>{t.body}</p>
      </main>
    );
  }

  return <InviteGuestView code={code} locale={locale} />;
}
