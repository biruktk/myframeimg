/**
 * One-shot data fix: restore hardware owner of frame "sura" (D0CF13F0161C)
 * to Abdiim, and keep Qanu as a shared MEMBER (sharedToUserIds).
 *
 * Usage (on VPS):
 *   cd /var/myframe/backend && node scripts/restore_sura_owner_abdiim.js
 *
 * Safe to re-run. Creates a timestamped .bak next to myframe-db.json.
 */
const fs = require("fs");
const path = require("path");

const dbPath = path.resolve(__dirname, "..", "data", "myframe-db.json");
const ABDIIM = "usr_wx_1785154183166_aad634d4";
const QANU = "usr_1785362436943_34d90cf7";
const FRAME_ID = "D0CF13F0161C";
const FAMILY_ID = "fam_1785794970808_e69b8a";

const bak = dbPath + ".bak_sura_owner_" + Math.floor(Date.now() / 1000);
fs.copyFileSync(dbPath, bak);

const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
const frame = (db.frames || []).find(
  (f) => f.id === FRAME_ID || String(f.bleMac || "").toUpperCase() === FRAME_ID,
);
if (!frame) {
  console.error("frame not found:", FRAME_ID);
  process.exit(1);
}

const prevOwner = frame.ownerUserId;
frame.ownerUserId = ABDIIM;
const shared = new Set((frame.sharedToUserIds || []).filter(Boolean));
shared.delete(ABDIIM);
if (QANU) shared.add(QANU);
if (prevOwner && prevOwner !== ABDIIM) shared.add(prevOwner);
frame.sharedToUserIds = [...shared];

const fam = (db.familyGroups || []).find((g) => g.id === FAMILY_ID);
if (fam) {
  if (!Array.isArray(fam.frameIds)) fam.frameIds = [];
  if (!fam.frameIds.includes(FRAME_ID)) fam.frameIds.push(FRAME_ID);
  const abdiimMem = fam.members.find((m) => m.userId === ABDIIM);
  if (abdiimMem) abdiimMem.role = "owner";
  else fam.members.unshift({ userId: ABDIIM, role: "owner" });
  const qanuMem = fam.members.find((m) => m.userId === QANU);
  if (qanuMem) qanuMem.role = "member";
  else fam.members.push({ userId: QANU, role: "member" });
}

const now = Date.now();
for (const uid of [ABDIIM, QANU, prevOwner]) {
  const u = (db.users || []).find((x) => x.id === uid);
  if (!u) continue;
  u.syncVersion = (u.syncVersion || 0) + 1;
  u.syncUpdatedAtMs = now;
  if (uid === ABDIIM) u.primaryFrameId = FRAME_ID;
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log("restored", {
  frame: FRAME_ID,
  owner: frame.ownerUserId,
  shared: frame.sharedToUserIds,
  backup: bak,
});
