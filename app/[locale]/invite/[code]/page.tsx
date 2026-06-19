import { InviteGuestView } from "@/components/frame/invite-guest-view";
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n";

type Props = {
  params: Promise<{ locale: string; code: string }>;
};

export default async function InviteGuestPage({ params }: Props) {
  const { locale: raw, code: rawCode } = await params;
  const locale: Locale = isLocale(raw) ? raw : defaultLocale;
  const code = String(rawCode ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (code.length !== 8) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <h1>Invalid invite link</h1>
        <p lang={locale}>This invite code is not valid.</p>
      </main>
    );
  }

  return <InviteGuestView code={code} />;
}
