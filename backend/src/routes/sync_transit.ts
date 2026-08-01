import crypto from "crypto";
import fs from "fs";
import path from "path";
import express, { Router, Request, Response } from "express";
import multer from "multer";
import { db } from "../db/store";
import { verifyUserJwtBearer, type AuthedUser } from "../services/app_user_jwt";
import { bumpUserSyncVersion } from "../services/account_sync_state";

const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_BYTES = 25 * 1024 * 1024;

export const syncTransitRouter = Router();
syncTransitRouter.use(express.json({ limit: "256kb" }));

function transitRoot(): string {
  const packageRoot = path.resolve(__dirname, "../..");
  const dir = path.resolve(packageRoot, process.env.TRANSIT_DIR || "uploads/transit");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function authed(req: Request, res: Response): AuthedUser | null {
  const user = verifyUserJwtBearer(req);
  if (!user) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return null;
  }
  return user;
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, transitRoot()),
    filename: (_req, file, cb) => {
      const safe = String(file.originalname || "blob")
        .replace(/[^a-zA-Z0-9._-]/g, "_")
        .slice(0, 80);
      cb(null, `${Date.now()}_${crypto.randomBytes(6).toString("hex")}_${safe}`);
    },
  }),
  limits: { fileSize: MAX_BYTES, files: 1 },
});

function deletePackageFiles(pkg: { storedName: string }) {
  try {
    const fp = path.join(transitRoot(), path.basename(pkg.storedName));
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch {
    /* ignore */
  }
}

/** Sweep expired / consumed packages. Safe to call often. */
export function cleanupExpiredTransit(): { removed: number } {
  const now = Date.now();
  let removed = 0;
  db.mutate((draft) => {
    if (!Array.isArray(draft.syncTransitPackages)) draft.syncTransitPackages = [];
    const keep: typeof draft.syncTransitPackages = [];
    for (const p of draft.syncTransitPackages) {
      const expired = p.expiresAtMs <= now;
      const consumed = p.consumedAtMs != null;
      if (expired || consumed) {
        deletePackageFiles(p);
        removed += 1;
      } else {
        keep.push(p);
      }
    }
    draft.syncTransitPackages = keep;
  });
  return { removed };
}

/** POST /api/v1/sync/transit — upload ephemeral media package (TTL 2h). */
syncTransitRouter.post("/v1/sync/transit", (req, res) => {
  const user = authed(req, res);
  if (!user) return;

  upload.single("file")(req, res, (err) => {
    if (err) {
      res.status(400).json({ ok: false, error: "upload_failed", detail: String(err.message || err) });
      return;
    }
    const file = req.file;
    if (!file) {
      res.status(400).json({ ok: false, error: "missing_file" });
      return;
    }
    if (!file.size || file.size <= 0) {
      try {
        fs.unlinkSync(file.path);
      } catch {
        /* ignore */
      }
      res.status(400).json({ ok: false, error: "empty_upload" });
      return;
    }

    const id = `tr_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
    const now = Date.now();
    const expiresAtMs = now + TTL_MS;
    const label = String((req.body && req.body.label) || file.originalname || "transit").slice(0, 120);

    db.mutate((draft) => {
      if (!Array.isArray(draft.syncTransitPackages)) draft.syncTransitPackages = [];
      draft.syncTransitPackages.push({
        id,
        userId: user.userId,
        filename: label,
        storedName: path.basename(file.filename),
        bytes: file.size,
        createdAtMs: now,
        expiresAtMs,
        consumedAtMs: null,
      });
      const u = draft.users.find((x) => x.id === user.userId);
      if (u) bumpUserSyncVersion(u);
    });

    res.json({
      ok: true,
      package_id: id,
      expires_at: expiresAtMs,
      bytes: file.size,
      download_path: `/api/v1/sync/transit/${encodeURIComponent(id)}`,
    });
  });
});

/** GET /api/v1/sync/transit — list pending packages for the caller. */
syncTransitRouter.get("/v1/sync/transit", (req, res) => {
  const user = authed(req, res);
  if (!user) return;
  cleanupExpiredTransit();
  const data = db.read();
  const now = Date.now();
  const items = (data.syncTransitPackages ?? [])
    .filter((p) => p.userId === user.userId && !p.consumedAtMs && p.expiresAtMs > now)
    .map((p) => ({
      package_id: p.id,
      filename: p.filename,
      bytes: p.bytes,
      created_at: p.createdAtMs,
      expires_at: p.expiresAtMs,
      download_path: `/api/v1/sync/transit/${encodeURIComponent(p.id)}`,
    }));
  res.json({ ok: true, packages: items });
});

/**
 * GET /api/v1/sync/transit/:packageId
 * Download once (or until TTL). Deletes file immediately after successful send.
 */
syncTransitRouter.get("/v1/sync/transit/:packageId", (req, res) => {
  const user = authed(req, res);
  if (!user) return;

  const packageId = String(req.params.packageId ?? "").trim();
  const data = db.read();
  const pkg = (data.syncTransitPackages ?? []).find((p) => p.id === packageId);
  if (!pkg || pkg.userId !== user.userId) {
    res.status(404).json({ ok: false, error: "not_found" });
    return;
  }
  if (pkg.consumedAtMs != null || pkg.expiresAtMs <= Date.now()) {
    cleanupExpiredTransit();
    res.status(410).json({ ok: false, error: "expired_or_consumed" });
    return;
  }

  const fp = path.join(transitRoot(), path.basename(pkg.storedName));
  if (!fs.existsSync(fp)) {
    db.mutate((draft) => {
      draft.syncTransitPackages = (draft.syncTransitPackages ?? []).filter((p) => p.id !== packageId);
    });
    res.status(404).json({ ok: false, error: "file_missing" });
    return;
  }

  res.download(fp, pkg.filename || path.basename(fp), (err) => {
    if (err) {
      if (!res.headersSent) res.status(500).json({ ok: false, error: "download_failed" });
      return;
    }
    // Delete immediately after client download (server-as-transient-transit).
    db.mutate((draft) => {
      const row = (draft.syncTransitPackages ?? []).find((p) => p.id === packageId);
      if (row) row.consumedAtMs = Date.now();
    });
    deletePackageFiles(pkg);
    cleanupExpiredTransit();
  });
});

/** DELETE /api/v1/sync/transit/:packageId — cancel pending package. */
syncTransitRouter.delete("/v1/sync/transit/:packageId", (req, res) => {
  const user = authed(req, res);
  if (!user) return;
  const packageId = String(req.params.packageId ?? "").trim();
  let found = false;
  db.mutate((draft) => {
    const list = draft.syncTransitPackages ?? [];
    const idx = list.findIndex((p) => p.id === packageId && p.userId === user.userId);
    if (idx >= 0) {
      found = true;
      deletePackageFiles(list[idx]!);
      list.splice(idx, 1);
      draft.syncTransitPackages = list;
      const u = draft.users.find((x) => x.id === user.userId);
      if (u) bumpUserSyncVersion(u);
    }
  });
  if (!found) {
    res.status(404).json({ ok: false, error: "not_found" });
    return;
  }
  res.json({ ok: true });
});

/** Start periodic TTL sweeper (call once from index). */
export function startTransitCleanupJob(intervalMs = 10 * 60 * 1000): NodeJS.Timeout {
  cleanupExpiredTransit();
  return setInterval(() => {
    try {
      cleanupExpiredTransit();
    } catch (e) {
      console.error("[transit] cleanup failed", e);
    }
  }, intervalMs);
}
