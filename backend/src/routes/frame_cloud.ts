import express from "express";
import jwt from "jsonwebtoken";

import {
  getFrame,
  isMqttConnected,
  listFrames,
  normalizeMac,
  publishPlayImage,
} from "../services/frame_mqtt";

function jwtSecret(): string {
  return process.env.FRAME_JWT_SECRET ?? process.env.JWT_SECRET ?? "change-me-frame-jwt";
}

function frameApiSecret(): string | null {
  const s = process.env.FRAME_API_SECRET?.trim();
  return s || null;
}

function requireFrameToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  const auth = req.headers.authorization;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    res.status(401).json({ ok: false, error: "missing_token" });
    return;
  }
  try {
    jwt.verify(token, jwtSecret());
    next();
  } catch {
    res.status(403).json({ ok: false, error: "invalid_token" });
  }
}

/**
 * Self-hosted frame API (MQTT). Mount at /api.
 * POST /api/frame-cloud/auth/token  { "secret": "<FRAME_API_SECRET>" }
 * GET  /api/frame-cloud/frames
 * GET  /api/frame-cloud/frames/:mac
 * POST /api/frame-cloud/frames/:mac/play  { "imageUrl": "https://..." }
 */
export function frameCloudRouter(publicBaseUrl: string) {
  const router = express.Router();
  const pub = publicBaseUrl.replace(/\/$/, "");

  router.post("/frame-cloud/auth/token", (req, res) => {
    const expected = frameApiSecret();
    if (!expected) {
      res.status(503).json({ ok: false, error: "frame_api_disabled_set_FRAME_API_SECRET" });
      return;
    }
    const secret = String(req.body?.secret ?? "");
    if (secret !== expected) {
      res.status(401).json({ ok: false, error: "invalid_secret" });
      return;
    }
    const token = jwt.sign({ scope: "frame_cloud" }, jwtSecret(), { expiresIn: "7d" });
    res.json({ ok: true, token });
  });

  router.get("/frame-cloud/health", (_req, res) => {
    res.json({
      ok: true,
      mqttConnected: isMqttConnected(),
      framesTracked: listFrames().length,
      publicBaseUrl: pub,
    });
  });

  router.get("/frame-cloud/frames", requireFrameToken, (_req, res) => {
    res.json({ ok: true, frames: listFrames() });
  });

  router.get("/frame-cloud/frames/:mac", requireFrameToken, (req, res) => {
    const f = getFrame(req.params.mac);
    if (!f) {
      res.status(404).json({ ok: false, error: "frame_not_seen" });
      return;
    }
    res.json({ ok: true, frame: f });
  });

  router.post("/frame-cloud/frames/:mac/play", requireFrameToken, async (req, res) => {
    const imageUrl = String(req.body?.imageUrl ?? "").trim();
    if (!imageUrl) {
      res.status(400).json({ ok: false, error: "imageUrl_required" });
      return;
    }
    try {
      const host = new URL(pub).hostname;
      await publishPlayImage(req.params.mac, imageUrl, host);
      res.json({ ok: true, queued: true, mac: normalizeMac(req.params.mac) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "mqtt_publish_failed";
      res.status(500).json({ ok: false, error: msg });
    }
  });

  return router;
}
