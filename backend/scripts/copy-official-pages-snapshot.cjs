"use strict";

/** Copy CMS page snapshot beside dist/ output so runtime can load it after tsc. */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = path.join(root, "src/data/marketing_official_pages_snapshot.json");
const dest = path.join(root, "dist/data/marketing_official_pages_snapshot.json");

if (!fs.existsSync(src)) {
  console.warn("[copy-official-pages-snapshot] No snapshot at", src, "(run npm run sync-official-pages)");
  process.exit(0);
}
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log("[copy-official-pages-snapshot] copied to dist/data");
