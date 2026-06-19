import { Router } from "express";
import { db } from "../db/store";
import { normalizedFrameMediaBaseUrl } from "../config/frame_media";
import { appendFrameLog } from "../services/frame_logs";
import {
  getFrame,
  isFrameMqttOnline,
  mqttConnectedForStatus,
  isMqttConnected,
  publishLoginAck,
  publishMqttBrokerConfig,
  publishPlayImage,
  resolveKnownMqttHardwareMac,
  resolveMqttHardwareMac,
} from "../services/frame_mqtt";

export const deviceRouter = Router();

function envBaseUrl(primary: string | undefined, fallback: string): string {
  return (primary?.trim() || fallback).replace(/\/$/, "");
}

function mediaBaseUrl(): string {
  const port = Number(process.env.PORT || 3001);
  const publicBaseUrl = envBaseUrl(process.env.PUBLIC_BASE_URL, `http://127.0.0.1:${port}`);
  return normalizedFrameMediaBaseUrl(publicBaseUrl) || publicBaseUrl;
}

function sameFrame(a: string | undefined, b: string | undefined): boolean {
  const am = resolveMqttHardwareMac(String(a ?? ""));
  const bm = resolveMqttHardwareMac(String(b ?? ""));
  return !!am && !!bm && am === bm;
}

/** Matches `ra/api` device status shape used by the app. */
deviceRouter.get("/device/status", (_req, res) => {
  const data = db.read();
  const d = data.device;
  const now = Date.now();
  const lastPhotoHours = d.lastPhotoAtMs == null ? null : Math.max(0, Math.floor((now - d.lastPhotoAtMs) / 3600000));
  const uptimeDays = Math.max(0, Math.floor((now - d.startedAtMs) / (24 * 3600000)));
  res.json({
    connected: d.connected,
    deviceId: d.id,
    deviceName: d.name,
    room: d.room,
    lastPhotoHours,
    storageGb: Number((d.usedBytes / 1024 / 1024 / 1024).toFixed(2)),
    photoCount: d.photoCount,
    uptimeDays,
    transport: d.transport,
  });
});

deviceRouter.get("/devices/:id/status", (req, res) => {
  const data = db.read();
  const d = data.device;
  const online = req.params.id === d.id ? d.connected : false;
  res.json({
    device_id: req.params.id,
    online,
    storage_used_mb: Math.round(d.usedBytes / 1024 / 1024),
    photo_count: d.photoCount,
  });
});

deviceRouter.get("/frames/:mac/status", (req, res) => {
  const data = db.read();
  const d = data.device;
  const mqttFrame = getFrame(req.params.mac);
  const requestedMac = resolveKnownMqttHardwareMac(req.params.mac) ?? resolveMqttHardwareMac(req.params.mac);
  const storedMac = resolveMqttHardwareMac(d.id);
  const onlineGraceMs = Number(process.env.FRAME_ONLINE_GRACE_MS ?? 600000) || 600000;
  const mqttOnline =
    !!mqttFrame &&
    mqttFrame.status === "online" &&
    mqttFrame.lastAction !== "shutdown" &&
    mqttFrame.age < onlineGraceMs;
  const storedFrame = data.frames.find((frame) => sameFrame(frame.id, req.params.mac) || sameFrame(frame.bleMac, req.params.mac));
  const storedLastSeenMs =
    typeof storedFrame?.lastSeenAtMs === "number"
      ? storedFrame.lastSeenAtMs
      : requestedMac === storedMac && d.connected
        ? d.lastPhotoAtMs
        : null;
  const storedRecent = typeof storedLastSeenMs === "number" && Date.now() - storedLastSeenMs < onlineGraceMs;
  const storedOnline =
    (!!requestedMac && requestedMac === storedMac && d.connected) ||
    storedFrame?.wifiStatus === "online" ||
    storedRecent;
  const online = mqttOnline || storedOnline;
  res.json({
    ok: true,
    device_id: req.params.mac,
    online,
    status: online ? "online" : "offline",
    app_paired: storedOnline,
    battery: 100,
    wifi: d.room,
    storage_used_mb: Math.round(d.usedBytes / 1024 / 1024),
    photo_count: d.photoCount,
    mqtt_connected: mqttConnectedForStatus(req.params.mac),
    last_seen_ms: mqttFrame?.lastSeen ?? storedLastSeenMs ?? null,
    last_upload_ms: d.lastPhotoAtMs,
    result: mqttFrame?.lastResult ?? null,
    lastResult: mqttFrame?.lastResult ?? null,
    displayCode: mqttFrame?.lastResult ?? null,
    lastAction: mqttFrame?.lastAction ?? null,
    displayed: mqttFrame?.displayed === true,
  });
});

deviceRouter.get("/frames/:mac/history", (req, res) => {
  const requestedMac = resolveKnownMqttHardwareMac(req.params.mac);
  const base = mediaBaseUrl();
  const uploads = db
    .read()
    .uploads.filter((u) => {
      if (!requestedMac) return false;
      return resolveMqttHardwareMac(u.deviceId) === requestedMac;
    })
    .slice(0, 50);
  const images = uploads.map((u) => ({
    id: u.id,
    url: `${base}/frame-media/${encodeURIComponent(u.filename)}`,
    imageUrl: `${base}/frame-media/${encodeURIComponent(u.filename)}`,
    sentAt: u.atMs,
    deliveredToFrame: u.deliveredToFrame === true,
    deliveryMode: u.deliveryMode ?? "unknown",
  }));
  res.json({ ok: true, images });
});

deviceRouter.post("/frames/:mac/mqtt-config", async (req, res) => {
  const mac = String(req.params.mac ?? "").trim();
  if (!resolveMqttHardwareMac(mac)) {
    res.status(400).json({ ok: false, error: "invalid_device_id_for_mqtt_config" });
    return;
  }
  if (!isMqttConnected()) {
    res.status(503).json({ ok: false, error: "mqtt_disconnected" });
    return;
  }
  try {
    const msgid = String(req.body?.msgid ?? Date.now()).trim();
    await publishMqttBrokerConfig(mac, msgid);
    res.json({
      ok: true,
      stamac: resolveMqttHardwareMac(mac),
      msgid,
      delivery_mode: "vps_mqtt_config_retain",
    });
  } catch (err) {
    res.status(502).json({
      ok: false,
      error: err instanceof Error ? err.message : "mqtt_config_publish_failed",
    });
  }
});

deviceRouter.post("/frames/:mac/login-ack", async (req, res) => {
  const mac = String(req.params.mac ?? "").trim();
  if (!resolveMqttHardwareMac(mac)) {
    res.status(400).json({ ok: false, error: "invalid_device_id_for_login_ack" });
    return;
  }
  if (!isMqttConnected()) {
    res.status(503).json({ ok: false, error: "mqtt_disconnected" });
    return;
  }
  try {
    const msgid = String(req.body?.msgid ?? Date.now()).trim();
    await publishLoginAck(mac, msgid);
    res.json({
      ok: true,
      stamac: resolveMqttHardwareMac(mac),
      msgid,
    });
  } catch (err) {
    res.status(502).json({
      ok: false,
      error: err instanceof Error ? err.message : "login_ack_publish_failed",
    });
  }
});

/** POST /api/device/send — push a stored or supplied photo URL to the frame via MQTT. */
deviceRouter.post("/device/send", async (req, res) => {
  const body = req.body as {
    deviceId?: unknown;
    device_id?: unknown;
    photoUrl?: unknown;
    photo_url?: unknown;
    image_url?: unknown;
  };
  const data = db.read();
  const deviceId = String(body.deviceId ?? body.device_id ?? data.device.id ?? "").trim();
  const suppliedUrl = String(body.photoUrl ?? body.photo_url ?? body.image_url ?? "").trim();
  const latestUpload = data.uploads.find((u) => !deviceId || u.deviceId === deviceId) ?? data.uploads[0];
  const imageUrl =
    suppliedUrl ||
    (latestUpload?.filename
      ? `${mediaBaseUrl()}/frame-media/${encodeURIComponent(latestUpload.filename)}`
      : "");

  if (!deviceId) {
    res.status(400).json({ ok: false, error: "missing_device_id" });
    return;
  }
  if (!imageUrl) {
    res.status(400).json({ ok: false, error: "missing_photo_url" });
    return;
  }
  if (!resolveKnownMqttHardwareMac(deviceId)) {
    res.status(400).json({ ok: false, error: "invalid_device_id_for_mqtt_play" });
    return;
  }
  if (!isMqttConnected()) {
    res.status(503).json({ ok: false, error: "mqtt_disconnected", deviceId, imageUrl });
    return;
  }

  try {
    let publicHost = "";
    try {
      publicHost = new URL(process.env.PUBLIC_MEDIA_BASE_URL || imageUrl).hostname;
    } catch {
      /* ignore */
    }
    await publishPlayImage(deviceId, imageUrl, publicHost || undefined);
    const now = Date.now();
    const hwMac = resolveMqttHardwareMac(deviceId) ?? deviceId;
    appendFrameLog({
      direction: "tx",
      mac: hwMac.replace(/[^a-fA-F0-9]/gi, "").toUpperCase(),
      frameName: data.device.name || deviceId,
      topic: `/inkjoyap/${hwMac}`,
      action: "play",
      payload: JSON.stringify({ imageUrl, source: "api_device_send" }),
    });
    db.mutate((draft) => {
      draft.device.connected = true;
      draft.device.id = deviceId;
      draft.device.lastPhotoAtMs = now;
      draft.frames = draft.frames.map((f) => (f.id === deviceId ? { ...f, lastSeenAtMs: now } : f));
      draft.auditLog.unshift({
        id: `audit_${now}_${Math.random().toString(16).slice(2, 8)}`,
        actor: "api_device_send",
        action: "device_send",
        target: deviceId,
        atMs: now,
        meta: { imageUrl },
      });
    });
    res.json({ ok: true, deviceId, imageUrl, delivery_mode: "vps_mqtt" });
  } catch (err) {
    res.status(502).json({
      ok: false,
      error: err instanceof Error ? err.message : "mqtt_publish_failed",
      deviceId,
      imageUrl,
    });
  }
});

/** Testing Github */
