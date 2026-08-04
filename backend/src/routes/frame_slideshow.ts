import express, { Request, Response, Router } from "express";
import { db } from "../db/store";
import { verifyUserJwtBearer } from "../services/app_user_jwt";
import { stopPlaybackForMacKeys } from "../services/slideshow_stop";
import { isRandomStrategy, seedCurrentIndex } from "../services/slideshow_index";

function normalizeMacKey(raw: string): string {
  try {
    return decodeURIComponent(raw).replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  } catch {
    return raw.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  }
}

function isPairingTokenValid(req: Request): boolean {
  const expected = String(process.env.FRAME_PAIRING_TOKEN ?? "").trim();
  if (!expected) return true;
  const auth = String(req.header("authorization") ?? "");
  const pt = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : String(req.header("x-pairing-token") ?? "").trim();
  if (!pt) return false;
  if (pt.length !== expected.length) return false;
  let match = 0;
  for (let i = 0; i < pt.length; i++) match |= pt.charCodeAt(i) ^ expected.charCodeAt(i);
  return match === 0;
}

export function frameSlideshowRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: "512kb" }));

  router.post("/frames/:mac/slideshow", (req: Request, res: Response) => {
    const u = verifyUserJwtBearer(req);
    if (!u && !isPairingTokenValid(req)) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }

    const macKey = normalizeMacKey(String(req.params.mac ?? ""));
    if (macKey.length < 8) {
      res.status(400).json({ ok: false, error: "invalid_mac", message: "MAC / device identifier too short" });
      return;
    }

    const body = req.body as {
      imageIds?: unknown;
      intervalMinutes?: unknown;
      strategy?: unknown;
      begintime?: unknown;
      endtime?: unknown;
      idle?: unknown;
      skipPlay?: unknown;
    };
    const rawIds = body.imageIds;
    const ids = Array.isArray(rawIds) ? rawIds.map((x) => String(x ?? "").trim()).filter((x) => x.length > 0) : [];
    const intervalMinutes = Math.round(Number(body.intervalMinutes));
    const strategy = Math.round(Number(body.strategy ?? 1));
    const begintime = String(body.begintime ?? "").trim();
    const endtime = String(body.endtime ?? "").trim();
    const idle = Math.round(Number(body.idle ?? 0));
    const skipPlay = body.skipPlay === true || String(body.skipPlay ?? "").trim() === "true";

    if (intervalMinutes < 1 || !isFinite(intervalMinutes)) {
      res.status(422).json({ ok: false, error: "invalid_interval", message: "intervalMinutes must be at least 1", fields: [{ field: "intervalMinutes", message: "Provide interval in minutes (min 1)" }] });
      return;
    }
    if (ids.length === 0) {
      res.status(422).json({ ok: false, error: "validation_error", message: "imageIds cannot be empty", fields: [{ field: "imageIds", message: "Provide at least one image id" }] });
      return;
    }

    console.log("[slideshow] POST macKey=%s ids=%d interval=%d strategy=%s idle=%d skipPlay=%s authed=%s", macKey, ids.length, intervalMinutes, isRandomStrategy(strategy) ? "random" : "sequential", idle, skipPlay, u ? "jwt:" + u.userId : "pairing_token");

    const now = Date.now();
    db.mutate((draft) => {
      if (!draft.slideshowsByBleMac) draft.slideshowsByBleMac = {};
      // currentIndex = last-played index (or -1 for random before first play).
      // Sequential !skipPlay: last=n-1 → first tick plays photos[0].
      // Random !skipPlay: last=-1 → first tick picks Math.random() * n (any photo).
      // skipPlay: photo[0] already on frame → last=0 so next tick advances from there.
      const startIndex = seedCurrentIndex({
        strategy,
        count: ids.length,
        skipPlay,
      });
      draft.slideshowsByBleMac[macKey] = {
        imageIds: ids,
        intervalMinutes,
        strategy: isRandomStrategy(strategy) ? 2 : 1,
        begintime,
        endtime,
        idle,
        updatedAtMs: now,
        currentIndex: startIndex,
        nextPlayAtMs: skipPlay ? now + intervalMinutes * 60 * 1000 : now,
      };
    });

    res.json({ ok: true, macKey, imageIds: ids, intervalMinutes, strategy: isRandomStrategy(strategy) ? 2 : 1, begintime, endtime, idle, skipPlay });
  });

  /** DELETE /api/frames/:mac/slideshow — clear slideshow, stop, play fallback image. */
  router.delete("/frames/:mac/slideshow", (req: Request, res: Response) => {
    const u = verifyUserJwtBearer(req);
    if (!u && !isPairingTokenValid(req)) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
    const macKey = normalizeMacKey(String(req.params.mac ?? ""));
    if (macKey.length < 8) {
      res.status(400).json({ ok: false, error: "invalid_mac" });
      return;
    }
    void stopPlaybackForMacKeys([macKey], { playFallback: true })
      .then((result) => {
        res.json({ ok: true, macKey, ...result });
      })
      .catch((err) => {
        console.warn("[slideshow] DELETE stop failed", macKey, err);
        res.status(500).json({ ok: false, error: "stop_failed" });
      });
  });

  /** POST /api/frames/:mac/stop-playlist — same powerful stop + fallback play. */
  router.post("/frames/:mac/stop-playlist", (req: Request, res: Response) => {
    const u = verifyUserJwtBearer(req);
    if (!u && !isPairingTokenValid(req)) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
    const macKey = normalizeMacKey(String(req.params.mac ?? ""));
    if (macKey.length < 8) {
      res.status(400).json({ ok: false, error: "invalid_mac" });
      return;
    }
    const exclude = Array.isArray(req.body?.excludeImageIds)
      ? (req.body.excludeImageIds as unknown[]).map((x) => String(x))
      : [];
    void stopPlaybackForMacKeys([macKey], {
      playFallback: true,
      excludeTokens: new Set(exclude.filter(Boolean)),
    })
      .then((result) => {
        res.json({ ok: true, macKey, ...result });
      })
      .catch((err) => {
        console.warn("[slideshow] stop-playlist failed", macKey, err);
        res.status(500).json({ ok: false, error: "stop_failed" });
      });
  });

  return router;
}
