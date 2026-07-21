import { redirect } from "next/navigation";
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n";

type Props = { params: Promise<{ locale: string }> };

/** Legacy/wrong URL (component name) → real dashboard route. */
export default async function PortalDashboardViewAliasPage({ params }: Props) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : defaultLocale;
  redirect(`/${locale}/app/home`);
}
