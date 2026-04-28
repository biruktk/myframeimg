import { AppShell } from "@/components/frame/app-shell";
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function AppLayout({ children, params }: Props) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : defaultLocale;

  return <AppShell locale={locale}>{children}</AppShell>;
}
