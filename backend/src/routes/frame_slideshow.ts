import express, { Request, Response, Router } from "express";
import { db } from "../db/store";
import { verifyUserJwtBearer } from "../services/app_user_jwt";
import {
  isFrameMqttOnline,
  isMqttConnected,
  publishPlayImage,
  resolveKnownMqttHardwareMac,
} from "../services/frame_mqtt";

/** Strip separators from MAC/device id segments for lookup keys */
function normalizeMacKey(raw: string): string {
  try {
    return decodeURIComponent(raw).replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  } catch {
    return raw.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  }
}

function resolvePlaybackUrl(deviceId: string, imageId: string, publicBase: string): string | null {
  const base = publicBase.replace(/\/$/, "");
  const data = db.read();
  const macKey = normalizeMacKey(deviceId);
  const candidates = data.uploads.filter(
    (u) => u.deviceId === deviceId || normalizeMacKey(u.deviceId) === macKey,
  );
  let upload =
    candidates.find((u) => u.filename === imageId || u.id === imageId) ??
    candidates.find((u) => u.checksumSha256 === imageId);
  if (!upload) return null;
  const name = upload.filename.trim();
  if (!name) return null;
  return `${base}/frame-media/${encodeURIComponent(name)}`;
}

export function frameSlideshowRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: "512kb" }));

  /** POST /api/frames/:mac/slideshow */
  router.post("/frames/:mac/slideshow", async (req: Request, res: Response) => {
    const u = verifyUserJwtBearer(req);
    if (!u) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }

    const macKey = normalizeMacKey(String(req.params.mac ?? ""));
    if (macKey.length < 8) {
      res.status(400).json({ ok: false, error: "invalid_mac", message: "MAC / device identifier too short" });
      return;
    }

    const body = req.body as { imageIds?: unknown; intervalMinutes?: unknown };
    const rawIds = body.imageIds;
    const ids = Array.isArray(rawIds) ? rawIds.map((x) => String(x ?? "").trim()).filter((x) => x.length > 0) : [];
    const intervalMinutes = Number(body.intervalMinutes);

    const allowedIntervals = new Set([60, 240, 480, 1440]);
    if (!allowedIntervals.has(intervalMinutes)) {
      res.status(422).json({
        ok: false,
        error: "invalid_interval",
        message: "intervalMinutes must be one of 60, 240, 480, 1440",
        fields: [{ field: "intervalMinutes", message: "Use 60, 240, 480, or 1440 minutes" }],
      });
      return;
    }
    if (ids.length === 0) {
      res.status(422).json({
        ok: false,
        error: "validation_error",
        message: "imageIds cannot be empty",
        fields: [{ field: "imageIds", message: "Provide at least one image id" }],
      });
      return;
    }

    db.mutate((draft) => {
      if (!draft.slideshowsByBleMac) draft.slideshowsByBleMac = {};
      draft.slideshowsByBleMac[macKey] = {
        imageIds: ids,
        intervalMinutes,
        updatedAtMs: Date.now(),
      };
    });

    const publicBase = String(process.env.PUBLIC_BASE_URL ?? process.env.PUBLIC_MEDIA_BASE_URL ?? "https://myframe.ink").trim();
    const frame = db.read().frames.find((f) => normalizeMacKey(f.bleMac) === macKey || f.id === macKey);
    const deviceId = frame?.id ?? macKey;
    let deliveredToFrame = false;
    let deliveryMode = "stored_only";

    const mqttMac = resolveKnownMqttHardwareMac(deviceId);
    const firstId = ids[0]!;
    const imageUrl = resolvePlaybackUrl(deviceId, firstId, publicBase);

    if (mqttMac && imageUrl && isMqttConnected()) {
      try {
        let publicHost = "";
        try {
          publicHost = new URL(publicBase).hostname;
        } catch {
          /* ignore */
        }
        await publishPlayImage(deviceId, imageUrl, publicHost || undefined);
        if (isFrameMqttOnline(deviceId)) {
          deliveredToFrame = true;
          deliveryMode = "mqtt_published";
        } else {
          deliveryMode = "mqtt_published_unconfirmed";
        }
      } catch {
        deliveryMode = "mqtt_publish_failed";
      }
    }

    res.json({
      ok: true,
      macKey,
      imageIds: ids,
      intervalMinutes,
      delivered_to_frame: deliveredToFrame,
      delivery_mode: deliveryMode,
      first_image_url: imageUrl,
    });
  });

  return router;
}
