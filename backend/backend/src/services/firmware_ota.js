"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.firmwareCheckForDevice = firmwareCheckForDevice;
exports.pushFirmwareOtaToFrameById = pushFirmwareOtaToFrameById;
exports.triggerFirmwareUpdate = triggerFirmwareUpdate;
exports.firmwareUploadDir = firmwareUploadDir;
const path_1 = __importDefault(require("path"));
const frame_media_1 = require("../config/frame_media");
const store_1 = require("../db/store");
const firmware_releases_1 = require("../data/firmware_releases");
const frame_mqtt_1 = require("./frame_mqtt");
function esp32BleMacFromWifi(wifiMac) {
    const v = Number.parseInt(wifiMac, 16);
    if (!Number.isFinite(v) || v < 0 || v > (1 << 48) - 3)
        return null;
    return (v + 2).toString(16).toUpperCase().padStart(12, "0");
}
function esp32WifiMacFromBle(bleMac) {
    const v = Number.parseInt(bleMac, 16);
    if (!Number.isFinite(v) || v < 2)
        return null;
    return (v - 2).toString(16).toUpperCase().padStart(12, "0");
}
function macKeyVariants(raw) {
    const out = new Set();
    const add = (value) => {
        if (!value)
            return;
        const trimmed = value.trim();
        if (!trimmed)
            return;
        const resolved = (0, frame_mqtt_1.resolveMqttHardwareMac)(trimmed);
        if (resolved) {
            out.add(resolved);
            const ble = esp32BleMacFromWifi(resolved);
            const wifi = esp32WifiMacFromBle(resolved);
            if (ble)
                out.add(ble);
            if (wifi)
                out.add(wifi);
            return;
        }
        out.add((0, frame_mqtt_1.normalizeMac)(trimmed));
        out.add(trimmed.toUpperCase());
    };
    add(raw);
    return out;
}
function framesMatchRef(frame, deviceRef) {
    const refKeys = macKeyVariants(deviceRef);
    const frameKeys = macKeyVariants(frame.id);
    for (const key of macKeyVariants(frame.bleMac))
        frameKeys.add(key);
    for (const ref of refKeys) {
        if (frameKeys.has(ref))
            return true;
    }
    return frame.id.trim() === deviceRef.trim();
}
function findVisibleFrame(deviceRef, visibleFrameIds) {
    const visible = new Set(visibleFrameIds);
    const data = store_1.db.read();
    const trimmed = deviceRef.trim();
    const exact = data.frames.find((f) => f.id === trimmed && visible.has(f.id));
    if (exact)
        return exact;
    for (const frame of data.frames) {
        if (!visible.has(frame.id))
            continue;
        if (framesMatchRef(frame, deviceRef))
            return frame;
    }
    return null;
}
function firmwarePublicUrl(filename) {
    const base = (0, frame_media_1.normalizedFrameMediaBaseUrl)();
    const clean = filename.replace(/^\/+/, "");
    if (!base)
        return `/firmware/${encodeURIComponent(clean)}`;
    return `${base}/firmware/${encodeURIComponent(clean)}`;
}
function liveFirmwareVersion(frameId, bleMac, stored) {
    const mac = (0, frame_mqtt_1.resolveMqttHardwareMac)(bleMac) ?? (0, frame_mqtt_1.resolveMqttHardwareMac)(frameId);
    if (!mac)
        return stored;
    const live = (0, frame_mqtt_1.getFrame)(mac);
    const fromMqtt = live?.config?.firmwareVersion;
    if (typeof fromMqtt === "string" && fromMqtt.trim()) {
        return (0, firmware_releases_1.normalizeFirmwareVersion)(fromMqtt);
    }
    return stored;
}
function firmwareCheckForDevice(deviceId, visibleFrameIds) {
    const frame = findVisibleFrame(deviceId, visibleFrameIds);
    if (!frame) {
        return { ok: false, error: "frame_not_found" };
    }
    const latest = (0, firmware_releases_1.latestFirmwareRelease)();
    const stored = (0, firmware_releases_1.normalizeFirmwareVersion)(frame.firmwareVersion);
    const current = liveFirmwareVersion(frame.id, frame.bleMac, stored);
    const mac = (0, frame_mqtt_1.resolveMqttHardwareMac)(frame.bleMac) ?? (0, frame_mqtt_1.resolveMqttHardwareMac)(frame.id);
    const live = mac ? (0, frame_mqtt_1.getFrame)(mac) : null;
    const frameOnline = live?.status === "online" || (frame.lastSeenAtMs != null && Date.now() - frame.lastSeenAtMs < 15 * 60 * 1000);
    return {
        ok: true,
        deviceId: frame.id,
        currentVersion: current,
        latestVersion: latest.version,
        updateAvailable: (0, firmware_releases_1.isFirmwareVersionNewer)(latest.version, current),
        releaseNotes: latest.releaseNotes,
        sizeBytes: latest.sizeBytes,
        otaStatus: frame.ota?.status ?? "idle",
        otaTargetVersion: frame.ota?.targetVersion ?? null,
        frameOnline,
        mqttConnected: live?.status === "online",
    };
}
async function pushFirmwareOtaToFrameById(deviceId, actorLabel, visibleFrameIds) {
    const data = store_1.db.read();
    const frame = (visibleFrameIds ? findVisibleFrame(deviceId, visibleFrameIds) : null) ??
        data.frames.find((f) => f.id === deviceId) ??
        data.frames.find((f) => framesMatchRef(f, deviceId));
    if (!frame)
        return { ok: false, error: "frame_not_found" };
    const latest = (0, firmware_releases_1.latestFirmwareRelease)();
    const downloadUrl = firmwarePublicUrl(latest.filename);
    const mac = (0, frame_mqtt_1.resolveMqttHardwareMac)(frame.bleMac) ?? (0, frame_mqtt_1.resolveMqttHardwareMac)(frame.id);
    if (!mac)
        return { ok: false, error: "invalid_frame_mac" };
    try {
        const { host, port } = (0, frame_media_1.frameMediaPlayEndpoint)();
        const firmwarePath = `/firmware/${encodeURIComponent(latest.filename)}`;
        await (0, frame_mqtt_1.publishOta)({
            mac,
            version: latest.version,
            downloadUrl,
            host,
            port,
            firmwarePath,
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : "mqtt_publish_failed";
        return { ok: false, error: "ota_publish_failed", message: msg };
    }
    const now = Date.now();
    store_1.db.mutate((draft) => {
        draft.frames = draft.frames.map((f) => {
            if (f.id !== frame.id)
                return f;
            return {
                ...f,
                ota: { targetVersion: latest.version, status: "updating" },
            };
        });
        draft.auditLog.unshift({
            id: `audit_${now}_${Math.random().toString(16).slice(2, 8)}`,
            actor: actorLabel,
            action: "firmware_ota_push",
            target: frame.id,
            atMs: now,
            meta: { version: latest.version, mac },
        });
    });
    return { ok: true, queued: true, targetVersion: latest.version, downloadUrl };
}
async function triggerFirmwareUpdate(deviceId, visibleFrameIds, actorUserId) {
    const check = firmwareCheckForDevice(deviceId, visibleFrameIds);
    if (!check.ok)
        return check;
    if (!check.updateAvailable) {
        return { ok: false, error: "already_up_to_date" };
    }
    if (!check.frameOnline) {
        return { ok: false, error: "frame_offline", message: "Frame must be online on Wi‑Fi to receive the update." };
    }
    return pushFirmwareOtaToFrameById(deviceId, actorUserId ? `user:${actorUserId}` : "user", visibleFrameIds);
}
function firmwareUploadDir(packageRoot, uploadDir) {
    return path_1.default.join(uploadDir, "firmware");
}
