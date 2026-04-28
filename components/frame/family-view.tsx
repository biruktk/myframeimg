import type { Locale } from "@/lib/i18n";
import { getAppStrings } from "@/lib/i18n-app";

export function FamilyView({ locale }: { locale: Locale }) {
  const t = getAppStrings(locale).family;

  return (
    <div>
      <header className="bg-white px-4 py-3 shadow-sm">
        <h1 className="text-lg font-bold">{t.title}</h1>
      </header>
      <div className="space-y-4 p-4">
        <p className="text-gray-700">{t.body}</p>
        <button
          type="button"
          className="w-full rounded-xl bg-myframe-primary py-3 font-semibold text-white shadow"
        >
          {t.invite}
        </button>
        <button
          type="button"
          className="w-full rounded-xl border border-gray-300 bg-white py-3 font-semibold"
        >
          {t.frames}
        </button>
      </div>
    </div>
  );
}
