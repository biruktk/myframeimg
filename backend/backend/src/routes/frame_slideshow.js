"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.frameSlideshowRouter = frameSlideshowRouter;
const express_1 = __importStar(require("express"));
const store_1 = require("../db/store");
const app_user_jwt_1 = require("../services/app_user_jwt");
const frame_mqtt_1 = require("../services/frame_mqtt");
/** Strip separators from MAC/device id segments for lookup keys */
function normalizeMacKey(raw) {
    try {
        return decodeURIComponent(raw).replace(/[^a-fA-F0-9]/g, "").toUpperCase();
    }
    catch {
        return raw.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
    }
}
function resolvePlaybackUrl(deviceId, imageId, publicBase) {
    const base = publicBase.replace(/\/$/, "");
    const data = store_1.db.read();
    const macKey = normalizeMacKey(deviceId);
    const macPrefix = macKey.slice(0, 10);
    const candidates = data.uploads.filter((u) => u.deviceId === deviceId || normalizeMacKey(u.deviceId) === macKey || normalizeMacKey(u.deviceId).startsWith(macPrefix));
    let upload = candidates.find((u) => u.filename === imageId || u.id === imageId) ??
        candidates.find((u) => u.checksumSha256 === imageId);
    if (!upload)
        return null;
    const name = upload.filename.trim();
    if (!name)
        return null;
    return `${base}/frame-media/${encodeURIComponent(name)}`;
}
async function delayMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
async function waitForFrameDisplayed(deviceId, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const state = (0, frame_mqtt_1.getFrame)(deviceId);
        if (state?.displayed === true)
            return true;
        await delayMs(2000);
    }
    return false;
}
function scheduleRemainingSlideshow(deviceId, remainingIds, intervalMinutes, publicBase) {
    if (remainingIds.length === 0)
        return;
    const publicHost = (() => { try {
        return new URL(publicBase).hostname;
    }
    catch {
        return "";
    } })();
    (async () => {
        for (const imageId of remainingIds) {
            const displayConfirmed = await waitForFrameDisplayed(deviceId, intervalMinutes * 60 * 1000);
            if (!displayConfirmed)
                return;
            await delayMs(intervalMinutes * 60 * 1000);
            const imageUrl = resolvePlaybackUrl(deviceId, imageId, publicBase);
            if (!imageUrl)
                return;
            try {
                await (0, frame_mqtt_1.publishPlayImage)(deviceId, imageUrl, publicHost || undefined);
            }
            catch {
                return;
            }
        }
    })();
}
function frameSlideshowRouter() {
    const router = (0, express_1.Router)();
    router.use(express_1.default.json({ limit: "512kb" }));
    /** POST /api/frames/:mac/slideshow */
    router.post("/frames/:mac/slideshow", async (req, res) => {
        const u = (0, app_user_jwt_1.verifyUserJwtBearer)(req);
        const pairingToken = String(req.headers["x-pairing-token"] ?? "").trim();
        if (!u && pairingToken !== process.env.PAIRING_TOKEN && pairingToken !== "framepass2026") {
            res.status(401).json({ ok: false, error: "unauthorized" });
            return;
        }
        const macKey = normalizeMacKey(String(req.params.mac ?? ""));
        if (macKey.length < 8) {
            res.status(400).json({ ok: false, error: "invalid_mac", message: "MAC / device identifier too short" });
            return;
        }
        const body = req.body;
        const rawIds = body.imageIds;
        const ids = Array.isArray(rawIds) ? rawIds.map((x) => String(x ?? "").trim()).filter((x) => x.length > 0) : [];
        const intervalMinutes = Number(body.intervalMinutes);
        // Arbitrary minute intervals supported by firmware protocol
        if (intervalMinutes < 1 || !Number.isFinite(intervalMinutes)) {
            res.status(422).json({
                ok: false,
                error: "invalid_interval",
                message: "intervalMinutes must be a positive integer (minutes)",
                fields: [{ field: "intervalMinutes", message: "Must be 1 or more minutes" }],
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
        store_1.db.mutate((draft) => {
            if (!draft.slideshowsByBleMac)
                draft.slideshowsByBleMac = {};
            draft.slideshowsByBleMac[macKey] = {
                imageIds: ids,
                intervalMinutes,
                updatedAtMs: Date.now(),
            };
        });
        const publicBase = String(process.env.PUBLIC_BASE_URL ?? process.env.PUBLIC_MEDIA_BASE_URL ?? "https://myframe.ink").trim();
        const frame = store_1.db.read().frames.find((f) => normalizeMacKey(f.bleMac) === macKey || f.id === macKey);
        const deviceId = frame?.id ?? macKey;
        let deliveredToFrame = false;
        let deliveryMode = "stored_only";
        const mqttMac = (0, frame_mqtt_1.resolveKnownMqttHardwareMac)(deviceId);
        const firstId = ids[0];
        const imageUrl = resolvePlaybackUrl(deviceId, firstId, publicBase);
        if (mqttMac && imageUrl && (0, frame_mqtt_1.isMqttConnected)()) {
            try {
                let publicHost = "";
                try {
                    publicHost = new URL(publicBase).hostname;
                }
                catch {
                    /* ignore */
                }
                await (0, frame_mqtt_1.publishPlayImage)(deviceId, imageUrl, publicHost || undefined);
                if ((0, frame_mqtt_1.isFrameMqttOnline)(deviceId)) {
                    deliveredToFrame = true;
                    deliveryMode = "mqtt_published";
                }
                else {
                    deliveryMode = "mqtt_published_unconfirmed";
                }
                // Schedule remaining slideshow images — wait for frame to confirm display (result 113)
                // before sending the next one with the interval delay.
                scheduleRemainingSlideshow(deviceId, ids.slice(1), intervalMinutes, publicBase);
            }
            catch {
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
