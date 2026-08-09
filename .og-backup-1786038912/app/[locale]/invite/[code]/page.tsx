import { notFound } from "next/navigation";
import { InviteGuestView } from "@/components/frame/invite-guest-view";
import { isLocale, type Locale } from "@/lib/i18n";

type Props = {
  params: Promise<{ locale: string; code: string }>;
};

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
