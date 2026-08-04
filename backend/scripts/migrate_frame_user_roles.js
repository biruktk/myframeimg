#!/usr/bin/env node
/**
 * Backfill frameUserRoles from legacy ownerUserId / sharedToUserIds.
 * Safe to re-run. Creates a timestamped .bak next to myframe-db.json.
 */
const fs = require("fs");
const path = require("path");

const dbPath = path.resolve(__dirname, "..", "data", "myframe-db.json");
if (!fs.existsSync(dbPath)) {
  console.error("DB not found:", dbPath);
  process.exit(1);
}

const bak = dbPath + ".bak_frame_roles_" + Math.floor(Date.now() / 1000);
fs.copyFileSync(dbPath, bak);
console.log("backup:", bak);

const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
if (!Array.isArray(db.frameUserRoles)) db.frameUserRoles = [];

const key = (frameId, userId) => frameId + "\0" + userId;
const existing = new Map(db.frameUserRoles.map((r) => [key(r.frameId, r.userId), r]));
const now = Date.now();
let inserted = 0;
let promoted = 0;

for (const f of db.frames || []) {
  const frameId = String(f.id || "").trim();
  if (!frameId) continue;

  const ownerId = String(f.ownerUserId || "").trim();
  if (ownerId && ownerId !== "usr_1") {
    const k = key(frameId, ownerId);
    const row = existing.get(k);
    if (!row) {
      const next = { frameId, userId: ownerId, role: "OWNER", createdAtMs: now };
      db.frameUserRoles.push(next);
      existing.set(k, next);
      inserted += 1;
    } else if (row.role !== "OWNER") {
      row.role = "OWNER";
      promoted += 1;
    }
  }

  for (const uid of f.sharedToUserIds || []) {
    const userId = String(uid || "").trim();
    if (!userId) continue;
    const k = key(frameId, userId);
    if (!existing.has(k)) {
      const next = { frameId, userId, role: "MEMBER", createdAtMs: now };
      db.frameUserRoles.push(next);
      existing.set(k, next);
      inserted += 1;
    }
  }
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
console.log(
  JSON.stringify(
    {
      ok: true,
      inserted,
      promoted,
      totalRoles: db.frameUserRoles.length,
      frames: (db.frames || []).length,
    },
    null,
    2,
  ),
);
