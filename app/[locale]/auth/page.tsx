import { defaultLocale, isLocale, type Locale } from "@/lib/i18n";
import { UserAuthView } from "@/components/auth/user-auth-view";

type Props = { params: Promise<{ locale: string }> };

export default async function Page({ params }: Props) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : defaultLocale;
  return <UserAuthView locale={locale} />;
}
