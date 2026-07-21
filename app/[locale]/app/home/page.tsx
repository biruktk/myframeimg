import { PortalDashboardView } from "@/components/frame/portal-dashboard-view";
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n";

type Props = { params: Promise<{ locale: string }> };

export default async function Page({ params }: Props) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : defaultLocale;

  return <PortalDashboardView locale={locale} />;
}
