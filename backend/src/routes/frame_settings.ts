import express, { Router } from "express";
import { db } from "../db/store";
import { verifyUserJwtBearer } from "../services/app_user_jwt";
import {
  isMqttConnected,
  publishMqttConfig,
} from "../services/frame_mqtt";

function normalizeMacKey(raw: string): string {
  try {
    return decodeURIComponent(raw).replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  } catch {
    return raw.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  }
}

const MODE_RE = /^(sequential|random)$/i;

interface PlaybackSettings {
  intervalMinutes: number;
  mode: "sequential" | "random";
  durationHours: number;
}

/**
 * PUT /api/frames/:mac/settings — save the global Frame Profile playback
 * defaults and push them to the frame hardware in real time over MQTT.
 *
 * Payload (globals used by the client + firmware):
 * ```
 * { global_interval, global_playback_mode, global_duration }
 * ```
 * or plain `{ interval, mode, duration }`. On success the frame receives an
 * `UPDATE_PLAYBACK_STRATEGY` MQTT action carrying the new interval / mode /
 * duration so its active slideshow timer updates instantly (no restart).
 */
export function frameSettingsRouter() {
  const router = Router();
  router.use(express.json({ limit: "128kb" }));

  function findFrame(macKey: string) {
    const data = db.read();
    return (
      data.frames.find(
        (f) => normalizeMacKey(f.id) === macKey || normalizeMacKey(f.bleMac) === macKey,
      ) ?? null
    );
  }

  function parsePlayback(body: Record<string, unknown>): PlaybackSettings | null {
    const rawInterval =
      body["global_interval"] ?? body["interval"] ?? body["intervalMinutes"] ?? body["intervalminutes"];
    const rawMode =
      body["global_playback_mode"] ?? body["mode"] ?? body["playbackMode"] ?? body["playback_mode"];
    const rawDuration =
      body["global_duration"] ?? body["duration"] ?? body["durationHours"];

    const interval = Math.round(Number(rawInterval));
    const duration = Math.round(Number(rawDuration));
    if (!Number.isFinite(interval) || interval < 1) return null;

    const modeStr = String(rawMode ?? "").trim().toLowerCase();
    const mode =
      MODE_RE.test(modeStr) || Number(rawMode) === 2
        ? (MODE_RE.test(modeStr) ? modeStr : "random")
        : "sequential";

    return {
      intervalMinutes: interval,
      mode: mode === "random" ? "random" : "sequential",
      durationHours: Number.isFinite(duration) ? duration : 0,
    };
  }

  /** Issue real-time MQTT config push so the frame updates its timer instantly. */
  function pushMqtt(mac: string, cfg: PlaybackSettings): void {
    if (!isMqttConnected()) return;
    publishMqttConfig(mac, {
      action: "UPDATE_PLAYBACK_STRATEGY",
      data: {
        intervalMinutes: cfg.intervalMinutes,
        mode: cfg.mode,
        durationHours: cfg.durationHours,
        strategy: cfg.mode === "random" ? 2 : 1,
        endtime: "",
      },
    }).catch((e) => {
      console.warn("[frame-settings] mqtt publish failed", mac, e);
    });
  }

  router.get("/frames/:mac/settings", function (req, res) {
    const u = verifyUserJwtBearer(req);
    if (!u) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
    const macKey = normalizeMacKey(String(req.params.mac ?? ""));
    if (macKey.length < 8) {
      res.status(400).json({ ok: false, error: "invalid_mac" });
      return;
    }
    const frame = findFrame(macKey);
    if (!frame) {
      res.status(404).json({ ok: false, error: "frame_not_found" });
      return;
    }
    const cfg = frame.playbackConfig;
    res.json({
      ok: true,
      settings: cfg
        ? {
            global_interval: cfg.intervalMinutes,
            global_playback_mode: cfg.mode,
            global_duration: cfg.durationHours,
          }
        : null,
    });
  });

  router.put("/frames/:mac/settings", function (req, res) {
    const u = verifyUserJwtBearer(req);
    if (!u) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
    const macKey = normalizeMacKey(String(req.params.mac ?? ""));
    if (macKey.length < 8) {
      res.status(400).json({ ok: false, error: "invalid_mac" });
      return;
    }
    const frame = findFrame(macKey);
    if (!frame) {
      res.status(404).json({ ok: false, error: "frame_not_found" });
      return;
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const cfg = parsePlayback(body);
    if (!cfg) {
      res.status(422).json({ ok: false, error: "invalid_settings", message: "Provide global_interval (>=1 min), global_playback_mode (sequential|random), global_duration" });
      return;
    }

    const publishMac = frame.stationMac || macKey;
    db.mutate((draft) => {
      const f = draft.frames.find(
        (x) => normalizeMacKey(x.id) === macKey || normalizeMacKey(x.bleMac) === macKey,
      );
      if (f) {
        f.playbackConfig = cfg;
        if (!f.playbackConfigUpdatedAtMs) f.playbackConfigUpdatedAtMs = Date.now();
      }
    });
    pushMqtt(publishMac, cfg);

    res.json({
      ok: true,
      macKey,
      settings: {
        global_interval: cfg.intervalMinutes,
        global_playback_mode: cfg.mode,
        global_duration: cfg.durationHours,
      },
    });
  });

  /** PUT /api/frames/:mac/name — update the frame's custom name/alias. */
  router.put("/frames/:mac/name", function (req, res) {
    const u = verifyUserJwtBearer(req);
    if (!u) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
    const macKey = normalizeMacKey(String(req.params.mac ?? ""));
    if (macKey.length < 8) {
      res.status(400).json({ ok: false, error: "invalid_mac" });
      return;
    }
    const frame = findFrame(macKey);
    if (!frame) {
      res.status(404).json({ ok: false, error: "frame_not_found" });
      return;
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const nameIn = String(
      body["custom_name"] ??
        body["alias"] ??
        body["frame_name"] ??
        body["display_name"] ??
        body["name"] ??
        ""
    ).trim();

    if (!nameIn) {
      res.status(422).json({ ok: false, error: "invalid_name", message: "Provide custom_name, alias, frame_name, display_name, or name" });
      return;
    }

    db.mutate((draft) => {
      const f = draft.frames.find(
        (x) => normalizeMacKey(x.id) === macKey || normalizeMacKey(x.bleMac) === macKey,
      );
      if (f) {
        (f as { displayName?: string | null }).displayName = nameIn;
      }
    });

    res.json({
      ok: true,
      macKey,
      name: nameIn,
    });
  });

  return router;
}