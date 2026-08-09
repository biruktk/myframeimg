"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.framePairingRouter = void 0;
const express_1 = require("express");
const store_1 = require("../db/store");
const security_1 = require("../middleware/security");
const app_user_jwt_1 = require("../services/app_user_jwt");
const frame_mqtt_1 = require("../services/frame_mqtt");
exports.framePairingRouter = (0, express_1.Router)();
function isInSleepWindow(paired) {
    if (!paired?.sleepConfig?.enabled)
        return false;
    var now = new Date();
    var curMin = now.getHours() * 60 + now.getMinutes();
    var startParts = paired.sleepConfig.startTime.split(":").map(Number);
    var endParts = paired.sleepConfig.endTime.split(":").map(Number);
    if (startParts.length < 2 || endParts.length < 2)
        return false;
    var startMin = startParts[0] * 60 + startParts[1];
    var endMin = endParts[0] * 60 + endParts[1];
    if (startMin <= endMin)
        return curMin >= startMin && curMin < endMin;
    return curMin >= startMin || curMin < endMin;
}
function frameStatusPayload(macRaw) {
    var mac = (0, frame_mqtt_1.resolveMqttHardwareMac)(macRaw);
    if (!mac) {
        return { ok: false, error: "invalid_mac" };
    }
    var rec = (0, frame_mqtt_1.getFrame)(mac);
    var data = store_1.db.read();
    var macNorm = (0, frame_mqtt_1.normalizeMac)(mac);
    var paired = data.frames.find(function (f) {
        var ids = [f.id, f.bleMac, f.stationMac ?? ""];
        return ids.some(function (id) {
            if (!id)
                return false;
            if ((0, frame_mqtt_1.resolveMqttHardwareMac)(id) === mac)
                return true;
            return (0, frame_mqtt_1.normalizeMac)(id) === macNorm || (0, frame_mqtt_1.normalizeMac)(id).slice(0, 10) === macNorm.slice(0, 10);
        });
    });
    var now = Date.now();
    var lastSeen = rec?.lastSeen ?? paired?.lastSeenAtMs ?? 0;
    var ageMs = lastSeen > 0 ? now - lastSeen : null;
    var memAlive = (0, frame_mqtt_1.isFrameMqttOnline)(mac);
    var dbAlive = paired != null &&
        paired.wifiStatus !== "never_provisioned" &&
        paired.lastSeenAtMs != null &&
        now - paired.lastSeenAtMs < frame_mqtt_1.HEARTBEAT_TIMEOUT_MS;
    var frameReachable = memAlive || dbAlive;
    var sleeping = isInSleepWindow(paired);
    var presence = (0, frame_mqtt_1.classifyFramePresence)(ageMs, sleeping);
    // App "online" means reachable (fresh or idle within grace), not only last 2 minutes.
    var onlineForApp = presence !== "offline";
    var apiMqtt = (0, frame_mqtt_1.isMqttConnected)();
    return {
        ok: true,
        device_id: mac,
        online: onlineForApp,
        sleeping: sleeping,
        status: presence,
        reachable: frameReachable || presence === "idle" || presence === "online",
        app_paired: !!paired,
        battery: rec?.battery ?? paired?.battery ?? 100,
        wifi: paired?.wifiSsid ?? data.device.room ?? "",
        storage_used_mb: rec?.storageUsed ?? paired?.storageUsed ?? Math.round(data.device.usedBytes / 1024 / 1024),
        storage_total_mb: rec?.storageTotal ?? paired?.storageTotal ?? 32000,
        photo_count: paired?.pendingQueue?.length ?? paired?.photoQueueDepth ?? data.device.photoCount ?? 0,
        mqtt_connected: frameReachable,
        api_mqtt_connected: apiMqtt,
        frame_mqtt_live: frameReachable,
        last_seen_ms: lastSeen,
        last_upload_ms: rec?.lastUploadMs ?? lastSeen,
        heartbeat_age_ms: ageMs,
        heartbeat_interval_ms: frame_mqtt_1.FRAME_HEART_INTERVAL_MS,
        online_grace_ms: frame_mqtt_1.HEARTBEAT_ONLINE_MS,
        offline_grace_ms: frame_mqtt_1.HEARTBEAT_TIMEOUT_MS,
        result: rec?.lastResult ?? null,
        lastResult: rec?.lastResult ?? null,
        displayCode: rec?.lastResult ?? null,
        lastAction: rec?.lastAction ?? null,
        displayed: rec?.displayed ?? false,
    };
}
exports.framePairingRouter.get("/frames/:mac/status", function (req, res) {
    var payload = frameStatusPayload(String(req.params.mac ?? ""));
    if (!payload.ok) {
        res.status(400).json(payload);
        return;
    }
    res.json(payload);
});
exports.framePairingRouter.post("/frames/:mac/login-ack", security_1.requirePairingToken, async function (req, res) {
    var mac = (0, frame_mqtt_1.resolveMqttHardwareMac)(String(req.params.mac ?? ""));
    if (!mac) {
        res.status(400).json({ ok: false, error: "invalid_mac" });
        return;
    }
    var body = (req.body ?? {});
    var msgid = String(body.msgid ?? Date.now());
    try {
        await (0, frame_mqtt_1.publishLoginAck)(mac, msgid);
        res.json({ ok: true, stamac: mac, msgid });
    }
    catch (err) {
        var message = err instanceof Error ? err.message : "mqtt_publish_failed";
        res.status((0, frame_mqtt_1.isMqttConnected)() ? 502 : 503).json({
            ok: false,
            error: message,
            api_mqtt_connected: (0, frame_mqtt_1.isMqttConnected)(),
        });
    }
});
exports.framePairingRouter.post("/frames/:mac/mqtt-config", security_1.requirePairingToken, async function (req, res) {
    var mac = (0, frame_mqtt_1.resolveMqttHardwareMac)(String(req.params.mac ?? ""));
    if (!mac) {
        res.status(400).json({ ok: false, error: "invalid_mac" });
        return;
    }
    var body = (req.body ?? {});
    var msgid = String(body.msgid ?? Date.now());
    try {
        await (0, frame_mqtt_1.publishRetainedMqttConfig)(mac, msgid);
        res.json({
            ok: true,
            stamac: mac,
            msgid,
            delivery_mode: "vps_mqtt_config_retain",
        });
    }
    catch (err) {
        var message = err instanceof Error ? err.message : "mqtt_publish_failed";
        res.status((0, frame_mqtt_1.isMqttConnected)() ? 502 : 503).json({
            ok: false,
            error: message,
            api_mqtt_connected: (0, frame_mqtt_1.isMqttConnected)(),
        });
    }
});
exports.framePairingRouter.get("/frames/:mac/history", function (req, res) {
    var mac = (0, frame_mqtt_1.resolveMqttHardwareMac)(String(req.params.mac ?? ""));
    if (!mac) {
        res.status(400).json({ ok: false, error: "invalid_mac" });
        return;
    }
    var data = store_1.db.read();
    var authed = (0, app_user_jwt_1.verifyUserJwtBearer)(req);
    var filtered = data.uploads.filter(function (u) { return (0, frame_mqtt_1.resolveMqttHardwareMac)(u.deviceId) === mac; });
    var authedId = authed?.userId;
    if (authedId) {
        filtered = filtered.filter(function (u) { return u.uploaderUserId === authedId; });
    }
    var uploads = filtered
        .sort(function (a, b) { return b.atMs - a.atMs; })
        .slice(0, 20)
        .map(function (u) {
        return {
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
        };
    });
    res.json({ ok: true, images: uploads });
});
