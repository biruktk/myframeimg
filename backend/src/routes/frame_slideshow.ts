import { notifyPlaylistSent } from "../services/wechat_subscribe_notify";
import express, { Request, Response, Router } from "express";
import { db } from "../db/store";
import { verifyUserJwtBearer } from "../services/app_user_jwt";
import { stopPlaybackForMacKeys } from "../services/slideshow_stop";
import { isRandomStrategy, seedCurrentIndex } from "../services/slideshow_index";
import {
  isMqttConnected,
  publishPlayImage,
  publishStrategyCommand,
  resolveMqttHardwareMac,
} from "../services/frame_mqtt";

function normalizeMacKey(raw: string): string {
  try {
    return decodeURIComponent(raw).replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  } catch {
    return raw.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  }
}

/** Idempotency guard: MAC -> last successful strategy_stop dispatch (ms). */
const lastStopTimestamp: Record<string, number> = {};

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
    // Canonical Wi-Fi STA MAC — the slideshow record and the MQTT topic must both
    // use this (not the caller's BLE MAC) so the manifest lookup matches.
    const publishMac = resolveMqttHardwareMac(macKey) ?? macKey;

    const body = req.body as {
      imageIds?: unknown;
      intervalMinutes?: unknown;
      /** Optional explicit unit tag — "second" | "minute". Default: "minute". */
      intervalUnit?: unknown;
      /** Seconds-since-epoch or minutes-since-epoch, per `intervalUnit`. */
      interval?: unknown;
      strategy?: unknown;
      begintime?: unknown;
      endtime?: unknown;
      idle?: unknown;
      skipPlay?: unknown;
      /** When true (default), publish first photo immediately after the
       *  strategy_bin MQTT command so the device shows the first image right
       *  away instead of waiting for the first interval tick. */
      immediatePlay?: unknown;
    };
    const rawIds = body.imageIds;
    const ids = Array.isArray(rawIds) ? rawIds.map((x) => String(x ?? "").trim()).filter((x) => x.length > 0) : [];
    // Interval unit normalisation: support both `intervalMinutes` (legacy)
    // and the explicit `interval` + `intervalUnit` pair. Default to MINUTES
    // for backwards compatibility with existing Flutter/Mini-Program clients.
    const intervalUnit = String(body.intervalUnit) === "second" ? "second" : "minute";
    let intervalMinutes = 0;
    if (typeof body.intervalMinutes === "number" || typeof body.intervalMinutes === "string") {
      intervalMinutes = Math.round(Number(body.intervalMinutes));
    } else if (typeof body.interval === "number" || typeof body.interval === "string") {
      const raw = Math.round(Number(body.interval));
      intervalMinutes = intervalUnit === "second"
        ? Math.max(1, Math.round(raw / 60))
        : Math.max(1, raw);
    }
    if (Number.isNaN(intervalMinutes) || intervalMinutes < 1) {
      if (u) {
        const usr = db.read().users.find(x => x.id === u.userId);
        if (usr && usr.playbackRules) {
          intervalMinutes = Math.round(usr.playbackRules.display_seconds / 60);
        }
      }
    }
    if (Number.isNaN(intervalMinutes) || intervalMinutes < 1) {
      intervalMinutes = 10;
    }
    const immediatePlay =
      body.immediatePlay === true || String(body.immediatePlay ?? "").trim() === "true" || !body.skipPlay;
    let strategy = Math.round(Number(body.strategy ?? 0));
    if (strategy !== 1 && strategy !== 2) {
      if (u) {
        const usr = db.read().users.find(x => x.id === u.userId);
        if (usr && usr.playbackRules) {
          strategy = usr.playbackRules.playback_mode === "random" ? 2 : 1;
        }
      }
    }
    if (strategy !== 1 && strategy !== 2) {
      strategy = 1;
    }
    const begintime = String(body.begintime ?? "").trim();
    let endtime = String(body.endtime ?? "").trim();
    if (!endtime && u) {
      const usr = db.read().users.find(x => x.id === u.userId);
      if (usr && usr.playbackRules && usr.playbackRules.duration_type && usr.playbackRules.duration_type !== "unlimited") {
        const hrs = parseInt(usr.playbackRules.duration_type, 10) || 0;
        if (hrs > 0) {
          endtime = String(Date.now() + hrs * 3600 * 1000);
        }
      }
    }
    const idle = Math.round(Number(body.idle ?? 1));
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
    // A frame in "stopped / fallback" state has no active slideshow record.
    // In that case a fresh send must play immediately instead of waiting a full
    // interval (otherwise a delete → re-send stalls the panel for up to
    // intervalMinutes on the stale fallback image).
    const priorSlideshow = db.read().slideshowsByBleMac?.[publishMac];
    const hadActiveSlideshow =
      !!priorSlideshow && (priorSlideshow.imageIds ?? []).length > 0;
    const effectiveSkipPlay = skipPlay;
    db.mutate((draft) => {
      if (!draft.slideshowsByBleMac) draft.slideshowsByBleMac = {};
      // currentIndex = last-played index (or -1 for random before first play).
      // Sequential !skipPlay: last=n-1 → first tick plays photos[0].
      // Random !skipPlay: last=-1 → first tick picks Math.random() * n (any photo).
      // skipPlay: photo[0] already on frame → last=0 so next tick advances from there.
      const startIndex = seedCurrentIndex({
        strategy,
        count: ids.length,
        skipPlay: effectiveSkipPlay,
      });
      draft.slideshowsByBleMac[publishMac] = {
        imageIds: ids,
        intervalMinutes,
        strategy: isRandomStrategy(strategy) ? 2 : 1,
        begintime,
        endtime,
        idle,
        updatedAtMs: now,
        currentIndex: startIndex,
        nextPlayAtMs: effectiveSkipPlay ? now + intervalMinutes * 60 * 1000 : now,
      };
    });

    // PROTOCOL COMPLIANCE: dispatch `strategy_bin` SYNCHRONOUSLY inside the
    // request lifecycle (<500ms) so the frame starts cycling immediately.
    // The app sends imageIds as upload filenames (e.g. 1..._slideshow_x.bin),
    // so resolve against BOTH upload.id and upload.filename. If a filename is
    // not found yet, still publish strategy_bin without imgs — the frame polls
    // /api/v1/frames/manifest for the current manifest regardless.
    const data = db.read();
    const imageUrls = ids
      .map((id) => {
        const upload =
          data.uploads.find((u) => u.id === id) ??
          data.uploads.find((u) => u.filename === id);
        return upload
          ? `${process.env.PUBLIC_BASE_URL?.replace(/\/$/, "")}/frame-media/${encodeURIComponent(upload.filename)}`
          : null;
      })
      .filter((url): url is string => url !== null);

    if (isMqttConnected()) {
      if (publishMac) {
        publishStrategyCommand(publishMac, {
          strategy: isRandomStrategy(strategy) ? 2 : 1,
          intervalMinutes,
          begintime,
          endtime,
          idle,
          imageUrls,
        })
          .then(() => {
            console.log("[slideshow] strategy_bin dispatched mac=%s imgs=%d", publishMac, imageUrls.length);
            // Immediate first-photo push: when the client asked for the first
            // image to render now (skipPlay=false OR immediatePlay=true), fire a
            // dedicated `play` command so the device refreshes without waiting
            // for the first interval timer tick. We do this AFTER strategy_bin
            // so the firmware has the manifest it needs to resolve the URL.
            if (immediatePlay && imageUrls.length > 0) {
              const firstUrl = imageUrls[0];
              const publicHost = process.env.PUBLIC_BASE_URL
                ? new URL(process.env.PUBLIC_BASE_URL).hostname
                : "myframe.ink";
              publishPlayImage(publishMac, firstUrl, publicHost)
                .then(() => console.log("[slideshow] immediate first-photo pushed mac=%s", publishMac))
                .catch((e) => console.warn("[slideshow] immediate first-photo failed", publishMac, e));
            }
          })
          .catch((e) => {
            console.warn("[slideshow] mqtt strategy failed", publishMac, e);
          });
      } else {
        console.warn("[slideshow] strategy_bin skipped (no mqtt mac for)", macKey);
      }
    } else {
      console.warn("[slideshow] strategy_bin skipped (mqtt offline)", macKey);
    }

    notifyPlaylistSent({ uploaderUserId: u?.userId, playlistTitle: "Playlist", photoCount: ids.length, frameName: macKey }).catch((e: unknown) => console.warn("[slideshow] notify error", e));
    res.json({ ok: true, macKey, imageIds: ids, intervalMinutes, intervalUnit, strategy: isRandomStrategy(strategy) ? 2 : 1, begintime, endtime, idle, skipPlay, immediatePlay });
  });

  // GET /api/v1/frames/manifest?mac=<MAC> — firmware polls this over plain HTTP
  // (http://{host}:{port}{path}) and expects data.imgList as a flat array of
  // relative /frame-media/*.bin paths. No auth: the frame has no tokens.
  router.get("/v1/frames/manifest", (req: Request, res: Response) => {
    const macRaw = String(req.query.mac ?? "").trim();
    // Resolve to the STA MAC so a BLE-MAC query still matches the STA-keyed
    // slideshow record.
    const macKey = macRaw ? (resolveMqttHardwareMac(macRaw) ?? normalizeMacKey(macRaw)) : "";
    const data = db.read();
    const slideshow = macKey ? (data.slideshowsByBleMac?.[macKey] ?? null) : null;
    const ids: string[] = Array.isArray(slideshow?.imageIds) ? slideshow.imageIds : [];

    const host = process.env.PUBLIC_BASE_URL
      ? new URL(process.env.PUBLIC_BASE_URL).hostname
      : "myframe.ink";
    const port = Number(process.env.FRAME_MANIFEST_PORT ?? 80) || 80;

    const seen = new Set<string>();
    const imgList: string[] = [];
    const MAX_BODY_BYTES = 16384;
    let bodyBytes = 200; // approx fixed JSON overhead

    for (const id of ids) {
      const upload =
        data.uploads.find((u) => u.id === id) ??
        data.uploads.find((u) => u.filename === id);
      const filename = String(upload?.filename ?? "").trim();
      if (!filename) continue;

      // Firmware constraints: .bin suffix, <=128 bytes, [a-zA-Z0-9_.-] only.
      const basename = filename.split("/").pop() ?? "";
      if (!basename.endsWith(".bin")) continue;
      if (Buffer.byteLength(basename, "utf8") > 128) continue;
      if (!/^[a-zA-Z0-9_.-]+$/.test(basename)) continue;
      if (seen.has(basename)) continue; // unique
      seen.add(basename);

      const rel = `/frame-media/${basename}`;
      if (bodyBytes + Buffer.byteLength(rel, "utf8") > MAX_BODY_BYTES) break;
      bodyBytes += Buffer.byteLength(rel, "utf8");
      imgList.push(rel);
    }

    res.json({
      code: 0,
      msg: "success",
      data: { host, port, imgList },
    });
  });

  // DELETE /api/frames/:mac/slideshow 2014 clear slideshow, stop playlist (strategy_stop only, no fallback play).
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
    void stopPlaybackForMacKeys([macKey], { playFallback: false })
      .then((result) => {
        res.json({ ok: true, macKey, ...result });
      })
      .catch((err) => {
        console.warn("[slideshow] DELETE stop failed", macKey, err);
        res.status(500).json({ ok: false, error: "stop_failed" });
      });
  });

  // POST /api/frames/:mac/stop-playlist 2014 stop playlist (strategy_stop only, no fallback play).
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
    // IDEMPOTENCY GUARD: if the frame already has no active slideshow AND we
    // dispatched a strategy_stop to this MAC within the last 10s, skip the
    // duplicate MQTT dispatch (back-to-back album deletes / double taps).
    const currentSlideshow = db.read().slideshowsByBleMac?.[macKey];
    const lastStopAt = lastStopTimestamp[macKey] ?? 0;
    const alreadyStopped = !currentSlideshow && Date.now() - lastStopAt < 5_000;
    if (alreadyStopped) {
      res.json({ ok: true, macKey, stopped: false, reason: "already_stopped" });
      return;
    }
    void stopPlaybackForMacKeys([macKey], {
      playFallback: false,
      excludeTokens: new Set(exclude.filter(Boolean)),
    })
      .then((result) => {
        lastStopTimestamp[macKey] = Date.now();
        res.json({ ok: true, macKey, ...result });
      })
      .catch((err) => {
        console.warn("[slideshow] stop-playlist failed", macKey, err);
        res.status(500).json({ ok: false, error: "stop_failed" });
      });
  });

  return router;
}
