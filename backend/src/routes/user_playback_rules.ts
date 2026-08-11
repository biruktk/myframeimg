import { Router } from "express";
import { db } from "../db/store";
import { verifyUserJwtBearer } from "../services/app_user_jwt";

export function userPlaybackRulesRouter(): Router {
  const router = Router();

  // GET /api/user/playback-rules
  router.get("/user/playback-rules", (req, res) => {
    const auth = verifyUserJwtBearer(req);
    if (!auth) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }

    const data = db.read();
    const user = data.users.find((u) => u.id === auth.userId);
    if (!user) {
      res.status(404).json({ ok: false, error: "user_not_found" });
      return;
    }

    // Default configuration fallback
    const rules = user.playbackRules || {
      display_seconds: 600,
      playback_mode: "sequential",
      duration_type: "unlimited",
      skip_play: true,
    };

    res.json({ ok: true, playbackRules: rules });
  });

  // PUT /api/user/playback-rules
  router.put("/user/playback-rules", (req, res) => {
    const auth = verifyUserJwtBearer(req);
    if (!auth) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }

    const body = (req.body || {}) as {
      display_seconds?: unknown;
      playback_mode?: unknown;
      duration_type?: unknown;
      skip_play?: unknown;
    };

    const display_seconds = Math.round(Number(body.display_seconds ?? 600));
    const playback_mode = String(body.playback_mode ?? "sequential").trim().toLowerCase();
    const duration_type = String(body.duration_type ?? "unlimited").trim().toLowerCase();
    const skip_play = body.skip_play !== false;

    if (!Number.isFinite(display_seconds) || display_seconds < 5) {
      res.status(422).json({ ok: false, error: "invalid_interval", message: "Interval must be at least 5 seconds." });
      return;
    }
    if (playback_mode !== "sequential" && playback_mode !== "random") {
      res.status(422).json({ ok: false, error: "invalid_mode", message: "Mode must be 'sequential' or 'random'." });
      return;
    }
    if (duration_type !== "unlimited" && duration_type !== "6h" && duration_type !== "12h" && duration_type !== "24h") {
      res.status(422).json({ ok: false, error: "invalid_duration", message: "Duration must be unlimited, 6h, 12h, or 24h." });
      return;
    }

    const rules = {
      display_seconds,
      playback_mode: playback_mode as "sequential" | "random",
      duration_type: duration_type as "unlimited" | "6h" | "12h" | "24h",
      skip_play,
    };

    db.mutate((draft) => {
      const u = draft.users.find((x) => x.id === auth.userId);
      if (u) {
        u.playbackRules = rules;
        u.syncVersion = (u.syncVersion ?? 0) + 1;
        u.syncUpdatedAtMs = Date.now();
      }
    });

    res.json({ ok: true, playbackRules: rules });
  });

  return router;
}
