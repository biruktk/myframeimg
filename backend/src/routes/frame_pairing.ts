import { Router } from "express";
import { db } from "../db/store";
import { requirePairingToken } from "../middleware/security";
import {
  getFrame,
  isFrameMqttOnline,
  isMqttConnected,
  publishLoginAck,
  publishRetainedMqttConfig,
  resolveMqttHardwareMac,
} from "../services/frame_mqtt";

export const framePairingRouter = Router();

function frameStatusPayload(macRaw: string) {
  const mac = resolveMqttHardwareMac(macRaw);
  if (!mac) {
    return { ok: false as const, error: "invalid_mac" };
  }

  const rec = getFrame(mac);
  const data = db.read();
  const paired = data.frames.find((f) => resolveMqttHardwareMac(f.id) === mac);
  const frameLive = isFrameMqttOnline(mac);
  const apiMqtt = isMqttConnected();
  const lastSeen = rec?.lastSeen ?? paired?.lastSeenAtMs ?? 0;

  return {
    ok: true as const,
    device_id: mac,
    online: frameLive,
    status: frameLive ? "online" : "offline",
    app_paired: !!paired,
    battery: 100,
    wifi: paired?.wifiSsid ?? data.device.room ?? "",
    storage_used_mb: Math.round(data.device.usedBytes / 1024 / 1024),
    photo_count: paired?.photoQueueDepth ?? data.device.photoCount ?? 0,
    /** Frame reported on MQTT recently (login/heart/play). */
    mqtt_connected: frameLive,
    /** API process can publish play/login to Mosquitto. */
    api_mqtt_connected: apiMqtt,
    frame_mqtt_live: frameLive,
    last_seen_ms: lastSeen,
    last_upload_ms: rec?.lastUploadMs ?? lastSeen,
    result: rec?.lastResult ?? null,
    lastResult: rec?.lastResult ?? null,
    displayCode: rec?.lastResult ?? null,
    lastAction: rec?.lastAction ?? null,
    displayed: rec?.displayed ?? false,
  };
}

/** GET /api/frames/:mac/status — live MQTT presence for apps (WeChat + iOS). */
framePairingRouter.get("/frames/:mac/status", (req, res) => {
  const payload = frameStatusPayload(String(req.params.mac ?? ""));
  if (!payload.ok) {
    res.status(400).json(payload);
    return;
  }
  res.json(payload);
});

/** POST /api/frames/:mac/login-ack — publish wake/login on `/inkjoyap/{MAC}`. */
framePairingRouter.post("/frames/:mac/login-ack", requirePairingToken, async (req, res) => {
  const mac = resolveMqttHardwareMac(String(req.params.mac ?? ""));
  if (!mac) {
    res.status(400).json({ ok: false, error: "invalid_mac" });
    return;
  }
  const body = (req.body ?? {}) as { msgid?: string; stamac?: string };
  const msgid = String(body.msgid ?? Date.now());
  try {
    await publishLoginAck(mac, msgid);
    res.json({ ok: true, stamac: mac, msgid });
  } catch (err) {
    const message = err instanceof Error ? err.message : "mqtt_publish_failed";
    res.status(isMqttConnected() ? 502 : 503).json({
      ok: false,
      error: message,
      api_mqtt_connected: isMqttConnected(),
    });
  }
});

/** POST /api/frames/:mac/mqtt-config — retained broker JSON on `/inkjoyap/{MAC}`. */
framePairingRouter.post("/frames/:mac/mqtt-config", requirePairingToken, async (req, res) => {
  const mac = resolveMqttHardwareMac(String(req.params.mac ?? ""));
  if (!mac) {
    res.status(400).json({ ok: false, error: "invalid_mac" });
    return;
  }
  const body = (req.body ?? {}) as { msgid?: string };
  const msgid = String(body.msgid ?? Date.now());
  try {
    await publishRetainedMqttConfig(mac, msgid);
    res.json({
      ok: true,
      stamac: mac,
      msgid,
      delivery_mode: "vps_mqtt_config_retain",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "mqtt_publish_failed";
    res.status(isMqttConnected() ? 502 : 503).json({
      ok: false,
      error: message,
      api_mqtt_connected: isMqttConnected(),
    });
  }
});

/** GET /api/frames/:mac/history — recent uploads for a frame (newest first, max 20). */
framePairingRouter.get("/frames/:mac/history", (req, res) => {
  const mac = resolveMqttHardwareMac(String(req.params.mac ?? ""));
  if (!mac) {
    res.status(400).json({ ok: false, error: "invalid_mac" });
    return;
  }
  const data = db.read();
  const uploads = data.uploads
    .filter((u) => resolveMqttHardwareMac(u.deviceId) === mac)
    .sort((a, b) => b.atMs - a.atMs)
    .slice(0, 20)
    .map((u) => ({
      id: u.id,
      filename: u.filename,
      atMs: u.atMs,
      bytes: u.bytes,
      checksumSha256: u.checksumSha256,
      deliveredToFrame: u.deliveredToFrame,
      deliveryMode: u.deliveryMode,
      imageUrl: `/frame-media/${encodeURIComponent(u.filename)}`,
      previewUrl: u.previewFilename
        ? `/frame-media/${encodeURIComponent(u.previewFilename)}`
        : undefined,
    }));
  res.json({ ok: true, images: uploads });
});
