import { redirect } from "next/navigation";

type Props = { params: Promise<{ slug: string }> };

export default async function LegacyEnglishContentPage({ params }: Props) {
  const { slug } = await params;
  if (slug === "download-app") redirect("/download");
  redirect(`/en/page/${slug}`);
}
