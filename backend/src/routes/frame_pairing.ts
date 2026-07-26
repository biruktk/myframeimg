import { Router } from "express";
import { db } from "../db/store";
import { requirePairingToken } from "../middleware/security";
import { verifyUserJwtBearer } from "../services/app_user_jwt";
import {
  getFrame,
  isFrameMqttOnline,
  isMqttConnected,
  publishLoginAck,
  publishRetainedMqttConfig,
  resolveMqttHardwareMac,
} from "../services/frame_mqtt";

export const framePairingRouter = Router();

function isInSleepWindow(paired: { sleepConfig?: { enabled: boolean; startTime: string; endTime: string } } | undefined): boolean {
  if (!paired?.sleepConfig?.enabled) return false;
  var now = new Date();
  var curMin = now.getHours() * 60 + now.getMinutes();
  var startParts = paired.sleepConfig.startTime.split(":").map(Number);
  var endParts = paired.sleepConfig.endTime.split(":").map(Number);
  if (startParts.length < 2 || endParts.length < 2) return false;
  var startMin = startParts[0] * 60 + startParts[1];
  var endMin = endParts[0] * 60 + endParts[1];
  if (startMin <= endMin) return curMin >= startMin && curMin < endMin;
  return curMin >= startMin || curMin < endMin;
}

function frameStatusPayload(macRaw: string) {
  var mac = resolveMqttHardwareMac(macRaw);
  if (!mac) {
    return { ok: false, error: "invalid_mac" };
  }

  var rec = getFrame(mac);
  var data = db.read();
  var paired = data.frames.find(
    function(f) { return [f.id, f.bleMac].some(function(id) { return resolveMqttHardwareMac(id) === mac; }); },
  );
  var frameLive = isFrameMqttOnline(mac) || (paired != null && paired.wifiStatus !== "never_provisioned");
  var sleeping = isInSleepWindow(paired);
  var apiMqtt = isMqttConnected();
  var lastSeen = rec?.lastSeen ?? paired?.lastSeenAtMs ?? 0;

  return {
    ok: true,
    device_id: mac,
    online: frameLive,
    sleeping: sleeping,
    status: sleeping ? "sleeping" : frameLive ? "online" : "offline",
    app_paired: !!paired,
    battery: rec?.battery ?? paired?.battery ?? 100,
    wifi: paired?.wifiSsid ?? data.device.room ?? "",
    storage_used_mb: rec?.storageUsed ?? paired?.storageUsed ?? Math.round(data.device.usedBytes / 1024 / 1024),
    storage_total_mb: rec?.storageTotal ?? paired?.storageTotal ?? 32000,
    photo_count: paired?.pendingQueue?.length ?? paired?.photoQueueDepth ?? data.device.photoCount ?? 0,
    mqtt_connected: frameLive,
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

framePairingRouter.get("/frames/:mac/status", function(req, res) {
  var payload = frameStatusPayload(String(req.params.mac ?? ""));
  if (!payload.ok) {
    res.status(400).json(payload);
    return;
  }
  res.json(payload);
});

framePairingRouter.post("/frames/:mac/login-ack", requirePairingToken, async function(req, res) {
  var mac = resolveMqttHardwareMac(String(req.params.mac ?? ""));
  if (!mac) {
    res.status(400).json({ ok: false, error: "invalid_mac" });
    return;
  }
  var body = (req.body ?? {}) as { msgid?: string; stamac?: string };
  var msgid = String(body.msgid ?? Date.now());
  try {
    await publishLoginAck(mac, msgid);
    res.json({ ok: true, stamac: mac, msgid });
  } catch (err) {
    var message = err instanceof Error ? err.message : "mqtt_publish_failed";
    res.status(isMqttConnected() ? 502 : 503).json({
      ok: false,
      error: message,
      api_mqtt_connected: isMqttConnected(),
    });
  }
});

framePairingRouter.post("/frames/:mac/mqtt-config", requirePairingToken, async function(req, res) {
  var mac = resolveMqttHardwareMac(String(req.params.mac ?? ""));
  if (!mac) {
    res.status(400).json({ ok: false, error: "invalid_mac" });
    return;
  }
  var body = (req.body ?? {}) as { msgid?: string };
  var msgid = String(body.msgid ?? Date.now());
  try {
    await publishRetainedMqttConfig(mac, msgid);
    res.json({
      ok: true,
      stamac: mac,
      msgid,
      delivery_mode: "vps_mqtt_config_retain",
    });
  } catch (err) {
    var message = err instanceof Error ? err.message : "mqtt_publish_failed";
    res.status(isMqttConnected() ? 502 : 503).json({
      ok: false,
      error: message,
      api_mqtt_connected: isMqttConnected(),
    });
  }
});

framePairingRouter.get("/frames/:mac/history", function(req, res) {
  var mac = resolveMqttHardwareMac(String(req.params.mac ?? ""));
  if (!mac) {
    res.status(400).json({ ok: false, error: "invalid_mac" });
    return;
  }
  var data = db.read();
  var authed = verifyUserJwtBearer(req);
  var filtered = data.uploads.filter(function(u) { return resolveMqttHardwareMac(u.deviceId) === mac; });
  var authedId = authed?.userId;
  if (authedId) {
    filtered = filtered.filter(function(u) { return u.uploaderUserId === authedId; });
  }
  var uploads = filtered
    .sort(function(a, b) { return b.atMs - a.atMs; })
    .slice(0, 20)
    .map(function(u) { return {
      id: u.id,
      filename: u.filename,
      atMs: u.atMs,
      bytes: u.bytes,
      checksumSha256: u.checksumSha256,
      deliveredToFrame: u.deliveredToFrame,
      deliveryMode: u.deliveryMode,
      imageUrl: "/frame-media/" + encodeURIComponent(u.filename),
      previewUrl: u.previewFilename
        ? "/frame-media/" + encodeURIComponent(u.previewFilename)
        : undefined,
    }; });
  res.json({ ok: true, images: uploads });
});
