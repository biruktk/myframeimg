import fs from "fs";
import path from "path";

type FixtureBundle = {
  translations: Record<string, Record<string, unknown>>;
  translatedFeatures: Record<string, Array<{ title: string; description: string }>>;
  contentPages: Record<string, Record<string, { title: string; excerpt?: string; body: string }>>;
};

let cached: FixtureBundle | null | undefined;

export function loadMarketingFixtureBundle(): FixtureBundle | null {
  if (cached !== undefined) return cached;
  const candidates = [
    path.join(process.cwd(), "fixtures/public-site-dev-fallback.json"),
    path.join(process.cwd(), "../fixtures/public-site-dev-fallback.json"),
    path.join(__dirname, "../../../fixtures/public-site-dev-fallback.json"),
    path.join(__dirname, "../../../../fixtures/public-site-dev-fallback.json"),
  ];
  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<FixtureBundle>;
      if (!raw.translations || !raw.translatedFeatures) continue;
      cached = {
        translations: raw.translations,
        translatedFeatures: raw.translatedFeatures,
        contentPages: raw.contentPages ?? {},
      };
      return cached;
    } catch {
      /* try next path */
    }
  }
  cached = null;
  return null;
}
