/**
 * Writes `web/fixtures/public-site-dev-fallback.json` for Next `/api/public/site`
 * when the Express backend is not running locally.
 *
 * Usage: npm run dump-public-site-fallback (from web/backend directory)
 */
import fs from "fs";
import path from "path";

import { getPublicSitePayload } from "../src/services/marketing_public";

function main(): void {
  const outDir = path.join(__dirname, "../../fixtures");
  const outPath = path.join(outDir, "public-site-dev-fallback.json");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(getPublicSitePayload(), null, 2));
  console.log(`Wrote ${outPath}`);
}

main();
