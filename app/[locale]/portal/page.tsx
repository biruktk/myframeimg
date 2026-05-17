import { redirect } from "next/navigation";
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n";

type Props = { params: Promise<{ locale: string }> };

/** Friendly alias → portal dashboard (`PortalDashboardView` at `/app/home`). */
export default async function PortalAliasPage({ params }: Props) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : defaultLocale;
  redirect(`/${locale}/app/home`);
}
