import { notFound } from "next/navigation";
import { FamilyJoinView } from "@/components/frame/family-join-view";
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string }>;
};

export default async function FamilyJoinPage({ params, searchParams }: Props) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();

  const locale: Locale = raw;
  const { code: rawCode } = await searchParams;
  const code = String(rawCode ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  return <FamilyJoinView locale={locale} code={code} />;
}
