import type { Locale } from "@/lib/i18n";
import { getAppStrings } from "@/lib/i18n-app";

const examples = [
  { title: "AI Creations", count: "0", gradient: "from-purple-600 to-pink-500", icon: "✨" },
  { title: "Family Moments", count: "12", gradient: "from-red-600 to-red-300", icon: "♥" },
  { title: "Vacation", count: "10", gradient: "from-blue-600 to-sky-400", icon: "☂" },
  { title: "Kids", count: "9", gradient: "from-green-600 to-green-400", icon: "☺" },
  { title: "Food", count: "6", gradient: "from-orange-600 to-amber-400", icon: "🍴" },
];

export function PlaylistView({ locale }: { locale: Locale }) {
  const t = getAppStrings(locale).playlist;

  return (
    <div>
      <header className="bg-white px-4 py-3 shadow-sm">
        <h1 className="text-lg font-bold">{t.title}</h1>
      </header>
      <div className="space-y-6 p-4">
        <div className="rounded-2xl border-2 border-dashed border-gray-400 bg-white p-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-myframe-primary text-3xl text-white">
            +
          </div>
          <p className="font-bold text-myframe-primary">{t.createTitle}</p>
          <p className="mt-1 text-sm text-gray-600">{t.createSub}</p>
        </div>

        <div>
          <h2 className="mb-3 font-bold">{t.examples}</h2>
          <div className="grid grid-cols-2 gap-3">
            {examples.map((e) => (
              <button
                key={e.title}
                type="button"
                className="overflow-hidden rounded-2xl bg-white text-left shadow"
              >
                <div
                  className={`flex h-24 items-center justify-center bg-gradient-to-br ${e.gradient} text-3xl text-white`}
                >
                  {e.icon}
                </div>
                <div className="p-2">
                  <p className="font-semibold">{e.title}</p>
                  <p className="text-xs text-gray-600">{e.count} photos</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
