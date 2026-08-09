"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deviceRouter = void 0;
const express_1 = require("express");
const store_1 = require("../db/store");
const frame_mqtt_1 = require("../services/frame_mqtt");
exports.deviceRouter = (0, express_1.Router)();
function envBaseUrl(primary, fallback) {
    return (primary?.trim() || fallback).replace(/\/$/, "");
}
function mediaBaseUrl() {
    const port = Number(process.env.PORT || 3001);
    const publicBaseUrl = envBaseUrl(process.env.PUBLIC_BASE_URL, `http://127.0.0.1:${port}`);
    return envBaseUrl(process.env.PUBLIC_MEDIA_BASE_URL || publicBaseUrl, publicBaseUrl);
}
/** Matches `ra/api` device status shape used by the app. */
exports.deviceRouter.get("/device/status", (_req, res) => {
    const data = store_1.db.read();
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
exports.deviceRouter.get("/devices/:id/status", (req, res) => {
    const data = store_1.db.read();
    const d = data.device;
    const online = req.params.id === d.id ? d.connected : false;
    res.json({
        device_id: req.params.id,
        online,
        storage_used_mb: Math.round(d.usedBytes / 1024 / 1024),
        photo_count: d.photoCount,
    });
});
/** POST /api/device/send — push a stored or supplied photo URL to the frame via MQTT. */
exports.deviceRouter.post("/device/send", async (req, res) => {
    const body = req.body;
    const data = store_1.db.read();
    const deviceId = String(body.deviceId ?? body.device_id ?? data.device.id ?? "").trim();
    const suppliedUrl = String(body.photoUrl ?? body.photo_url ?? body.image_url ?? "").trim();
    const latestUpload = data.uploads.find((u) => !deviceId || u.deviceId === deviceId) ?? data.uploads[0];
    const imageUrl = suppliedUrl ||
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
    if (!(0, frame_mqtt_1.resolveMqttHardwareMac)(deviceId)) {
        res.status(400).json({ ok: false, error: "invalid_device_id_for_mqtt_play" });
        return;
    }
    if (!(0, frame_mqtt_1.isMqttConnected)()) {
        res.status(503).json({ ok: false, error: "mqtt_disconnected", deviceId, imageUrl });
        return;
    }
    try {
        let publicHost = "";
        try {
            publicHost = new URL(process.env.PUBLIC_MEDIA_BASE_URL || imageUrl).hostname;
        }
        catch {
            /* ignore */
        }
        await (0, frame_mqtt_1.publishPlayImage)(deviceId, imageUrl, publicHost || undefined);
        const now = Date.now();
        store_1.db.mutate((draft) => {
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
    }
    catch (err) {
        res.status(502).json({
            ok: false,
            error: err instanceof Error ? err.message : "mqtt_publish_failed",
            deviceId,
            imageUrl,
        });
    }
});
/** Testing Github */
