import Image from "next/image";
import Link from "next/link";
import { getDictionary, isLocale, locales, type Locale } from "@/lib/i18n";

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function LocaleHomePage({ params }: Props) {
  const { locale } = await params;
  const safeLocale: Locale = isLocale(locale) ? locale : "en";
  const t = getDictionary(safeLocale);

  return (
    <div className="min-h-screen bg-myframe-paper text-myframe-ink">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-myframe-line/80 bg-white/85 px-4 backdrop-blur-md sm:px-8">
        <Link href={`/${safeLocale}`} className="flex shrink-0 items-center gap-2" aria-label="MyFrame home">
          <Image
            src="/ra/myframe-logo.svg"
            alt=""
            width={142}
            height={34}
            className="h-8 w-auto"
            priority
          />
        </Link>
        <nav className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
          <span className="hidden text-xs text-myframe-muted sm:inline">{t.languageLabel}:</span>
          {locales.map((item) => (
            <Link
              key={item}
              href={`/${item}`}
              className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${
                safeLocale === item
                  ? "border-myframe-primary bg-red-50 text-myframe-primary"
                  : "border-myframe-line bg-white text-myframe-text hover:bg-myframe-soft"
              }`}
            >
              {item.toUpperCase()}
            </Link>
          ))}
        </nav>
        <Link
          href={`/${safeLocale}/app/home`}
          className="shrink-0 rounded-lg bg-myframe-brand px-3 py-2 text-center text-xs font-bold text-white shadow-sm transition hover:bg-myframe-brand-dark sm:px-4 sm:text-sm"
        >
          {t.navOpenApp}
        </Link>
      </header>

      <main>
        <section
          className="border-b border-myframe-line/60 px-4 py-14 sm:px-8 sm:py-20"
          style={{
            background:
              "radial-gradient(circle at 18% 18%, rgba(217, 34, 42, 0.12), transparent 28%), radial-gradient(circle at 86% 20%, rgba(15, 118, 110, 0.11), transparent 26%), linear-gradient(135deg, #fff6f6 0%, #ffffff 44%, #f4faf8 100%)",
          }}
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-12 lg:flex-row lg:items-center lg:gap-16">
            <div className="min-w-0 flex-1">
              <p className="mb-4 text-xs font-extrabold uppercase tracking-widest text-myframe-brand">
                {t.heroEyebrow}
              </p>
              <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-myframe-ink sm:text-5xl lg:text-6xl">
                {t.heroTitle}
              </h1>
              <p className="mt-6 max-w-xl text-lg text-myframe-text">{t.heroLead}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href={`/${safeLocale}/app/home`}
                  className="inline-flex min-h-[42px] items-center justify-center rounded-lg bg-myframe-brand px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-myframe-brand-dark"
                >
                  {t.ctaPrimary}
                </Link>
                <Link
                  href={`/${safeLocale}/app/send`}
                  className="inline-flex min-h-[42px] items-center justify-center rounded-lg border border-myframe-line bg-white px-5 py-2.5 text-sm font-bold text-myframe-ink transition hover:bg-myframe-soft"
                >
                  {t.ctaSecondary}
                </Link>
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-lg flex-1 lg:mx-0">
              <div className="relative overflow-hidden rounded-lg border border-red-200/40 bg-gradient-to-br from-white via-rose-50/30 to-teal-50/40 p-6 shadow-xl shadow-gray-900/10">
                <Image
                  src="/ra/myframe-hero-scene.svg"
                  alt=""
                  width={520}
                  height={400}
                  className="h-auto w-full"
                  priority
                />
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-myframe-line bg-myframe-soft px-4 py-12 sm:px-8">
          <div className="mx-auto max-w-6xl">
            <h2 className="mb-8 text-center text-2xl font-bold text-myframe-ink sm:text-3xl">{t.subtitle}</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {t.quickSteps.map((step, index) => (
                <article
                  key={step}
                  className="rounded-xl border border-myframe-line bg-myframe-paper p-6 shadow-sm transition hover:-translate-y-0.5"
                >
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-myframe-muted">
                    {t.quickStartTitle} {index + 1}
                  </p>
                  <p className="text-base font-semibold text-myframe-ink">{step}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <footer className="px-4 py-8 sm:px-8">
          <p className="mx-auto max-w-3xl text-center text-xs leading-relaxed text-myframe-muted">{t.raReferenceNote}</p>
        </footer>
      </main>
    </div>
  );
}
