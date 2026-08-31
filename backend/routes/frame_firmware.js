"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.frameFirmwareRouter = void 0;
const express_1 = require("express");
const store_1 = require("../db/store");
const app_user_jwt_1 = require("../services/app_user_jwt");
const frame_mqtt_1 = require("../services/frame_mqtt");
const firmware_releases_1 = require("../data/firmware_releases");
exports.frameFirmwareRouter = (0, express_1.Router)();
function lookupMacInDb(macNorm) {
    const data = store_1.db.read();
    return data.frames.find((f) => (0, frame_mqtt_1.normalizeMac)(f.bleMac) === macNorm || (0, frame_mqtt_1.normalizeMac)(f.id) === macNorm);
}
exports.frameFirmwareRouter.get("/frames/:mac/firmware", (req, res) => {
    const mac = (0, frame_mqtt_1.resolveMqttHardwareMac)(String(req.params.mac ?? ""));
    if (!mac) {
        res.status(400).json({ ok: false, error: "invalid_mac" });
        return;
    }
    (0, app_user_jwt_1.verifyUserJwtBearer)(req);
    const dbFrame = lookupMacInDb(mac);
    const live = (0, frame_mqtt_1.getFrame)(mac);
    const frameOnline = (0, frame_mqtt_1.isFrameMqttOnline)(mac);
    if (!dbFrame && !live) {
        res.json({ ok: false, error: "frame_not_found" });
        return;
    }
    const latest = (0, firmware_releases_1.latestFirmwareRelease)();
    const fromMqtt = live?.config?.firmwareVersion;
    const dbVersion = (0, firmware_releases_1.normalizeFirmwareVersion)(dbFrame?.firmwareVersion ?? "0.0.0");
    const current = typeof fromMqtt === "string" && fromMqtt.trim() ? (0, firmware_releases_1.normalizeFirmwareVersion)(fromMqtt) : dbVersion;
    res.json({
        ok: true,
        mac,
        firmwareVersion: current,
        currentVersion: current,
        latestVersion: latest.version,
        updateAvailable: (0, firmware_releases_1.isFirmwareVersionNewer)(latest.version, current),
        releaseNotes: latest.releaseNotes,
        sizeBytes: latest.sizeBytes,
        otaStatus: dbFrame?.ota?.status ?? "idle",
        otaTargetVersion: dbFrame?.ota?.targetVersion ?? null,
        frameOnline,
    });
});
exports.frameFirmwareRouter.post("/frames/:mac/firmware/update", async (req, res) => {
    const mac = (0, frame_mqtt_1.resolveMqttHardwareMac)(String(req.params.mac ?? ""));
    if (!mac) {
        res.status(400).json({ ok: false, error: "invalid_mac" });
        return;
    }
    const auth = (0, app_user_jwt_1.verifyUserJwtBearer)(req);
    if (!auth) {
        res.status(401).json({ ok: false, error: "unauthorized" });
        return;
    }
    const live = (0, frame_mqtt_1.getFrame)(mac);
    const frameOnline = (0, frame_mqtt_1.isFrameMqttOnline)(mac);
    if (!live || !frameOnline) {
        res.status(400).json({ ok: false, error: "frame_offline", message: "Frame must be online to receive the update." });
        return;
    }
    const fromMqtt = live?.config?.firmwareVersion;
    const current = typeof fromMqtt === "string" && fromMqtt.trim() ? (0, firmware_releases_1.normalizeFirmwareVersion)(fromMqtt) : "0.0.0";
    const latest = (0, firmware_releases_1.latestFirmwareRelease)();
    if (!(0, firmware_releases_1.isFirmwareVersionNewer)(latest.version, current)) {
        res.json({ ok: false, error: "already_up_to_date" });
        return;
    }
    const publicBaseUrl = String(process.env.PUBLIC_MEDIA_BASE_URL || process.env.PUBLIC_BASE_URL || "https://myframe.ink").replace(/\/$/, "");
    const downloadUrl = `${publicBaseUrl}/firmware/${encodeURIComponent(latest.filename)}`;
    try {
        await (0, frame_mqtt_1.publishJson)(`/myframe/${mac}`, {
            msgid: Date.now().toString(),
            action: "ota",
            stamac: mac,
            data: {
                version: latest.version,
                url: downloadUrl,
            },
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : "mqtt_publish_failed";
        res.status(502).json({ ok: false, error: "ota_publish_failed", message });
        return;
    }
    const dbFrame = lookupMacInDb(mac);
    if (dbFrame) {
        store_1.db.mutate((draft) => {
            draft.frames = draft.frames.map((f) => {
                if ((0, frame_mqtt_1.normalizeMac)(f.bleMac) !== mac && (0, frame_mqtt_1.normalizeMac)(f.id) !== mac)
                    return f;
                return { ...f, ota: { targetVersion: latest.version, status: "updating" } };
            });
        });
    }
    res.json({ ok: true, queued: true, targetVersion: latest.version, downloadUrl });
});
