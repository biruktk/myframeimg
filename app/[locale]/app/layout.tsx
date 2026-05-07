import { AppShell } from "@/components/frame/app-shell";
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { USER_TOKEN_COOKIE } from "@/lib/user-auth";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function AppLayout({ children, params }: Props) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : defaultLocale;
  const c = await cookies();
  const token = c.get(USER_TOKEN_COOKIE)?.value?.trim() ?? "";
  if (!token) {
    redirect(`/${locale}/auth`);
  }

  return <AppShell locale={locale}>{children}</AppShell>;
}
