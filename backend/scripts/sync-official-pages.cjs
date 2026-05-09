"use strict";

/**
 * Pulls CRM-style HTML from ../../myframe_official_web/src/pageContentDefaults.js
 * into src/data/marketing_official_pages_snapshot.json for the backend merge pipeline.
 *
 * npm run sync-official-pages (from web/backend)
 */
const path = require("path");
const fs = require("fs");

const defaultsPath = path.join(__dirname, "../../..", "myframe_official_web", "src", "pageContentDefaults.js");

if (!fs.existsSync(defaultsPath)) {
  console.error("Missing:", defaultsPath);
  process.exit(1);
}

// eslint-disable-next-line import/no-dynamic-require, global-require -- local sync script only
const getDefaults = require(defaultsPath);
const snapshot = typeof getDefaults === "function" ? getDefaults() : getDefaults.default?.();
if (!snapshot || typeof snapshot !== "object") {
  console.error("pageContentDefaults did not return an object.");
  process.exit(1);
}

const outDir = path.join(__dirname, "..", "src", "data");
const outFile = path.join(outDir, "marketing_official_pages_snapshot.json");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 2));
console.log("Wrote", outFile);
