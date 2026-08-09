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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.photoRouter = photoRouter;
const crypto_1 = __importDefault(require("crypto"));
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const store_1 = require("../db/store");
const security_1 = require("../middleware/security");
const app_user_jwt_1 = require("../services/app_user_jwt");
const frame_mqtt_1 = require("../services/frame_mqtt");
const firebase_admin_1 = require("../services/firebase_admin");
const photo_queue_1 = require("../services/photo_queue");
const myfm_encode_1 = require("../services/myfm_encode");
/**
 * POST /api/photo/upload
 * Multipart: field `file` (binary), body fields: filename, device_id, checksum, size
 * As described in `ra/api/Image_Processing_API_Integration.md` step 6.
 */
function photoRouter(uploadDir, publicBaseUrl) {
    const router = express_1.default.Router();
    const base = publicBaseUrl.replace(/\/$/, "");
    (0, photo_queue_1.initQueue)(base);
    const storage = multer_1.default.diskStorage({
        destination: (_req, _file, cb) => cb(null, uploadDir),
        filename: (_req, file, cb) => {
            const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
            const name = `${Date.now()}_${safe || "upload.bin"}`;
            cb(null, name);
        },
    });
    const upload = (0, multer_1.default)({
        storage,
        limits: { fileSize: 15 * 1024 * 1024 },
    });
    const MAX_UPLOAD_AGE_MS = 30 * 24 * 60 * 60 * 1000;
    function pruneOldUploads() {
        const cutoff = Date.now() - MAX_UPLOAD_AGE_MS;
        store_1.db.mutate((draft) => {
            const keep = [];
            for (const u of draft.uploads) {
                if (u.atMs < cutoff) {
                    try {
                        const p = path_1.default.join(uploadDir, path_1.default.basename(u.filename));
                        if (fs_1.default.existsSync(p))
                            fs_1.default.unlinkSync(p);
                    }
                    catch { /* ignore */ }
                }
                else {
                    keep.push(u);
                }
            }
            draft.uploads = keep;
        });
    }
    router.post("/photo/upload", security_1.requirePairingToken, security_1.uploadRateLimit, upload.single("file"), async (req, res) => {
        try {
            const file = req.file;
            if (!file) {
                res.status(400).json({ ok: false, error: "missing_file" });
                return;
            }
            const deviceId = String(req.body.device_id ?? "");
            const clientChecksum = String(req.body.checksum ?? "");
            const declaredSize = Number(req.body.size ?? file.size);
            const slideshowStyle = String(req.body.slideshow_style ?? "").trim();
            const transport = String(req.body.transport ?? "").trim();
            const skipPlay = String(req.body.skip_play ?? "").trim() === "true";
            const buf = fs_1.default.readFileSync(file.path);
            const sha256 = crypto_1.default.createHash("sha256").update(buf).digest("hex");
            const basename = path_1.default.basename(file.path);
            const ext = path_1.default.extname(basename).toLowerCase();
            const encodeMyfm = String(process.env.FRAME_MYFM_ENCODE ?? "1").trim() !== "0";
            const looksLikeRaster = (0, myfm_encode_1.looksLikeRasterBuffer)(buf, ext);
            let mqttBasename = basename;
            let imageProcessing = "stored_raw";
            if (!buf.length) {
                res.status(400).json({
                    ok: false,
                    error: "empty_upload",
                    message: "Uploaded file is empty (0 bytes). On iPhone: grant Full Photos access and wait for iCloud download, then retry.",
                });
                return;
            }
            if ((0, myfm_encode_1.isProbablyMyfmBuffer)(buf)) {
                (0, myfm_encode_1.assertXt13e6Bin)(buf);
                mqttBasename = await (0, myfm_encode_1.storeClientXtBin)(buf, uploadDir, basename);
                imageProcessing = "client_passthrough";
            }
            else if (ext === ".bin") {
                res.status(400).json({
                    ok: false,
                    error: "invalid_xt_bin",
                    message: `Upload must be exactly ${myfm_encode_1.XT_BIN_TOTAL_BYTES} bytes with header 04 B0 06 40, or send JPEG/PNG for server encode.`,
                    received_bytes: buf.length,
                });
                return;
            }
            else if (encodeMyfm && looksLikeRaster) {
                try {
                    mqttBasename = await (0, myfm_encode_1.writeMyfmSidecar)(file.path);
                    imageProcessing = "server_myfm_encode";
                }
                catch (err) {
                    const detail = err instanceof Error ? err.message : String(err);
                    console.error("[photo] MYFM encode failed:", detail);
                    const empty = detail.includes("empty_image_upload");
                    res.status(empty ? 400 : 503).json({
                        ok: false,
                        error: empty ? "empty_upload" : "myfm_encode_failed",
                        message: detail,
                        hint: empty
                            ? "iPhone sent 0 bytes — Full Photos access + fully downloaded photo required."
                            : "Server normalizes HEIC/PNG/WebP to sRGB JPEG then encodes XT .bin. If this persists, the file may be corrupt.",
                    });
                    return;
                }
            }
            const imageUrl = `${base}/frame-media/${encodeURIComponent(mqttBasename)}`;
            /** JPEG/PNG raster kept beside `.bin`; MYFM `.bin` is MQTT target; both counted for quota when present. */
            let persistedDiskBytes = buf.length;
            let jpegBackupStoredPath = null;
            if (mqttBasename !== basename &&
                mqttBasename.toLowerCase().endsWith(".bin") &&
                path_1.default.extname(basename).toLowerCase() !== ".bin" &&
                fs_1.default.existsSync(file.path)) {
                jpegBackupStoredPath = basename;
                try {
                    const binSz = fs_1.default.statSync(path_1.default.join(uploadDir, mqttBasename)).size;
                    persistedDiskBytes = buf.length + binSz;
                }
                catch {
                    persistedDiskBytes = buf.length;
                }
            }
            const playbackMyfmBin = mqttBasename.toLowerCase().endsWith(".bin");
            const now = Date.now();
            const uploadId = `${now}-${Math.random().toString(16).slice(2, 8)}`;
            let deliveredToFrame = false;
            let deliveryMode = "stored_only";
            let queued = false;
            let mqttMacForUpload = null;
            if (!skipPlay) {
                mqttMacForUpload = (0, frame_mqtt_1.resolveMqttHardwareMac)(deviceId);
                if (mqttMacForUpload) {
                    if (!(0, frame_mqtt_1.isMqttConnected)()) {
                        deliveryMode = "mqtt_disconnected";
                        (0, photo_queue_1.enqueueUpload)(deviceId, uploadId);
                        queued = true;
                    }
                    else if (!(0, photo_queue_1.isDeliverySlotFree)(deviceId)) {
                        deliveryMode = "queued_slot_busy";
                        (0, photo_queue_1.enqueueUpload)(deviceId, uploadId);
                        queued = true;
                    }
                    else {
                        let publicHost = "";
                        try {
                            publicHost = new URL(process.env.PUBLIC_MEDIA_BASE_URL || base).hostname;
                        }
                        catch {
                            /* ignore */
                        }
                        try {
                            // Kill firmware-local playlist rotation before the new single image.
                            await (0, frame_mqtt_1.publishStopPlaylistKeepDisplay)(deviceId).catch(() => { });
                            await (0, frame_mqtt_1.publishPlayImage)(deviceId, imageUrl, publicHost || undefined);
                            deliveredToFrame = true;
                            deliveryMode = "vps_mqtt";
                            (0, photo_queue_1.scheduleNextDelivery)(deviceId);
                        }
                        catch (err) {
                            console.error("[photo] MQTT play publish failed:", err);
                            deliveryMode = "mqtt_publish_failed";
                            (0, photo_queue_1.enqueueUpload)(deviceId, uploadId);
                            queued = true;
                        }
                    }
                }
            }
            store_1.db.mutate((draft) => {
                if (!skipPlay && mqttMacForUpload && draft.slideshowsByBleMac?.[mqttMacForUpload]) {
                    delete draft.slideshowsByBleMac[mqttMacForUpload];
                }
                draft.device.connected = true;
                draft.device.transport.wifi = transport === "wifi" || draft.device.transport.wifi;
                draft.device.transport.bluetooth = transport === "bluetooth" || draft.device.transport.bluetooth;
                draft.device.lastPhotoAtMs = now;
                draft.device.photoCount += 1;
                draft.device.usedBytes += persistedDiskBytes;
                if (deviceId) {
                    draft.device.id = deviceId;
                    draft.device.name = `${deviceId} Connected`;
                }
                draft.frames = draft.frames.map((f) => {
                    if (f.id !== (deviceId || draft.device.id))
                        return f;
                    return {
                        ...f,
                        lastSeenAtMs: now,
                        wifiStatus: transport === "wifi" ? "online" : f.wifiStatus,
                    };
                });
                draft.uploads.unshift({
                    id: uploadId,
                    filename: mqttBasename,
                    previewFilename: jpegBackupStoredPath || undefined,
                    bytes: persistedDiskBytes,
                    deviceId: deviceId || draft.device.id,
                    atMs: now,
                    checksumSha256: sha256,
                    deliveredToFrame,
                    deliveryMode,
                    deliveryCheckedAtMs: now,
                    uploaderUserId: (0, app_user_jwt_1.verifyUserJwtBearer)(req)?.userId,
                });
                if (draft.uploads.length > 2000) {
                    draft.uploads = draft.uploads.slice(0, 2000);
                }
                pruneOldUploads();
                draft.auditLog.unshift({
                    id: `audit_${now}_${Math.random().toString(16).slice(2, 8)}`,
                    actor: "api_upload",
                    action: "photo_uploaded",
                    target: deviceId || draft.device.id,
                    atMs: now,
                    meta: {
                        filename: mqttBasename,
                        bytes: persistedDiskBytes,
                        deliveredToFrame,
                        deliveryMode,
                    },
                });
            });
            // Notify frame subscribers + uploader (MAC-normalized lookup on server)
            {
                const uploaderId = (0, app_user_jwt_1.verifyUserJwtBearer)(req)?.userId;
                (0, firebase_admin_1.sendPushToFrameSubscribers)(deviceId || store_1.db.read().device.id, "New Photo Uploaded", `A photo was uploaded to your frame${deviceId ? " (" + deviceId + ")" : ""}.`, { alsoNotifyUserId: uploaderId });
            }
            res.json({
                ok: true,
                received_bytes: buf.length,
                declared_size: declaredSize,
                /** MYFM basename used in MQTT (`image_url`). */
                stored_path: mqttBasename,
                frame_play_basename: mqttBasename,
                /** Original JPEG/PNG kept next to `.bin` for preview/debug (not in MQTT). */
                preview_stored_path: jpegBackupStoredPath,
                /** True when playback is MYFM `.bin`. */
                myfm_sidecar: playbackMyfmBin,
                /** Expect 960004 for official 1200×1600 XT 13.3E6 `.bin`. */
                myfm_file_bytes: playbackMyfmBin && fs_1.default.existsSync(path_1.default.join(uploadDir, mqttBasename))
                    ? fs_1.default.statSync(path_1.default.join(uploadDir, mqttBasename)).size
                    : null,
                device_id: deviceId || "unknown",
                checksum_sha256: sha256,
                client_checksum: clientChecksum || null,
                matches_declared_size: declaredSize === buf.length,
                slideshow_style: slideshowStyle || null,
                transport: transport || null,
                delivered_to_frame: deliveredToFrame,
                delivery_mode: deliveryMode,
                queued: queued,
                image_url: imageUrl,
                /** `client_passthrough` = exact bytes from iOS/Flutter `.bin`; never re-dithered on VPS. */
                image_processing: imageProcessing,
            });
        }
        catch (e) {
            res.status(500).json({
                ok: false,
                error: e instanceof Error ? e.message : "upload_failed",
            });
        }
    });
    async function handleFrameUpload(req, res, deviceId) {
        try {
            const file = req.file;
            if (!file) {
                res.status(400).json({ ok: false, error: "missing_photo" });
                return;
            }
            const clientChecksum = String(req.body.checksum ?? "");
            const declaredSize = Number(req.body.size ?? file.size);
            const slideshowStyle = String(req.body.slideshow_style ?? "").trim();
            const transport = String(req.body.transport ?? "").trim();
            const skipPlay = String(req.body.skip_play ?? "").trim() === "true";
            const buf = fs_1.default.readFileSync(file.path);
            const sha256 = crypto_1.default.createHash("sha256").update(buf).digest("hex");
            const basename = path_1.default.basename(file.path);
            const ext = path_1.default.extname(basename).toLowerCase();
            const encodeMyfm = String(process.env.FRAME_MYFM_ENCODE ?? "1").trim() !== "0";
            const looksLikeRaster = (0, myfm_encode_1.looksLikeRasterBuffer)(buf, ext);
            let mqttBasename = basename;
            let imageProcessing = "stored_raw";
            if (!buf.length) {
                res.status(400).json({
                    ok: false,
                    error: "empty_upload",
                    message: "Uploaded file is empty (0 bytes). On iPhone: grant Full Photos access and wait for iCloud download, then retry.",
                });
                return;
            }
            if ((0, myfm_encode_1.isProbablyMyfmBuffer)(buf)) {
                (0, myfm_encode_1.assertXt13e6Bin)(buf);
                mqttBasename = await (0, myfm_encode_1.storeClientXtBin)(buf, uploadDir, basename);
                imageProcessing = "client_passthrough";
            }
            else if (ext === ".bin") {
                res.status(400).json({
                    ok: false,
                    error: "invalid_xt_bin",
                    message: `Upload must be exactly ${myfm_encode_1.XT_BIN_TOTAL_BYTES} bytes with header 04 B0 06 40, or send JPEG/PNG for server encode.`,
                    received_bytes: buf.length,
                });
                return;
            }
            else if (encodeMyfm && looksLikeRaster) {
                try {
                    mqttBasename = await (0, myfm_encode_1.writeMyfmSidecar)(file.path);
                    imageProcessing = "server_myfm_encode";
                }
                catch (err) {
                    const detail = err instanceof Error ? err.message : String(err);
                    console.error("[photo] MYFM encode failed:", detail);
                    const empty = detail.includes("empty_image_upload");
                    res.status(empty ? 400 : 503).json({
                        ok: false,
                        error: empty ? "empty_upload" : "myfm_encode_failed",
                        message: detail,
                        hint: empty
                            ? "iPhone sent 0 bytes — Full Photos access + fully downloaded photo required."
                            : "Server normalizes HEIC/PNG/WebP to sRGB JPEG then encodes XT .bin. If this persists, the file may be corrupt.",
                    });
                    return;
                }
            }
            const imageUrl = `${base}/frame-media/${encodeURIComponent(mqttBasename)}`;
            let persistedDiskBytes = buf.length;
            let jpegBackupStoredPath = null;
            if (mqttBasename !== basename &&
                mqttBasename.toLowerCase().endsWith(".bin") &&
                path_1.default.extname(basename).toLowerCase() !== ".bin" &&
                fs_1.default.existsSync(file.path)) {
                jpegBackupStoredPath = basename;
                try {
                    const binSz = fs_1.default.statSync(path_1.default.join(uploadDir, mqttBasename)).size;
                    persistedDiskBytes = buf.length + binSz;
                }
                catch {
                    persistedDiskBytes = buf.length;
                }
            }
            const playbackMyfmBin = mqttBasename.toLowerCase().endsWith(".bin");
            const now = Date.now();
            const uploadId = `${now}-${Math.random().toString(16).slice(2, 8)}`;
            let deliveredToFrame = false;
            let deliveryMode = "stored_only";
            let queued = false;
            let mqttMacForUpload = null;
            if (!skipPlay) {
                mqttMacForUpload = (0, frame_mqtt_1.resolveMqttHardwareMac)(deviceId);
                if (mqttMacForUpload) {
                    if (!(0, frame_mqtt_1.isMqttConnected)()) {
                        deliveryMode = "mqtt_disconnected";
                        (0, photo_queue_1.enqueueUpload)(deviceId, uploadId);
                        queued = true;
                    }
                    else if (!(0, photo_queue_1.isDeliverySlotFree)(deviceId)) {
                        deliveryMode = "queued_slot_busy";
                        (0, photo_queue_1.enqueueUpload)(deviceId, uploadId);
                        queued = true;
                    }
                    else {
                        let publicHost = "";
                        try {
                            publicHost = new URL(process.env.PUBLIC_MEDIA_BASE_URL || base).hostname;
                        }
                        catch {
                            /* ignore */
                        }
                        try {
                            // Kill firmware-local playlist rotation before the new single image.
                            await (0, frame_mqtt_1.publishStopPlaylistKeepDisplay)(deviceId).catch(() => { });
                            await (0, frame_mqtt_1.publishPlayImage)(deviceId, imageUrl, publicHost || undefined);
                            deliveredToFrame = true;
                            deliveryMode = "vps_mqtt";
                            (0, photo_queue_1.scheduleNextDelivery)(deviceId);
                        }
                        catch (err) {
                            console.error("[photo] MQTT play publish failed:", err);
                            deliveryMode = "mqtt_publish_failed";
                            (0, photo_queue_1.enqueueUpload)(deviceId, uploadId);
                            queued = true;
                        }
                    }
                }
            }
            store_1.db.mutate((draft) => {
                if (!skipPlay && mqttMacForUpload && draft.slideshowsByBleMac?.[mqttMacForUpload]) {
                    delete draft.slideshowsByBleMac[mqttMacForUpload];
                }
                draft.device.connected = true;
                draft.device.transport.wifi = transport === "wifi" || draft.device.transport.wifi;
                draft.device.transport.bluetooth = transport === "bluetooth" || draft.device.transport.bluetooth;
                draft.device.lastPhotoAtMs = now;
                draft.device.photoCount += 1;
                draft.device.usedBytes += persistedDiskBytes;
                if (deviceId) {
                    draft.device.id = deviceId;
                    draft.device.name = `${deviceId} Connected`;
                }
                draft.frames = draft.frames.map((f) => {
                    if (f.id !== (deviceId || draft.device.id))
                        return f;
                    return {
                        ...f,
                        lastSeenAtMs: now,
                        wifiStatus: transport === "wifi" ? "online" : f.wifiStatus,
                    };
                });
                draft.uploads.unshift({
                    id: uploadId,
                    filename: mqttBasename,
                    previewFilename: jpegBackupStoredPath || undefined,
                    bytes: persistedDiskBytes,
                    deviceId: deviceId || draft.device.id,
                    atMs: now,
                    checksumSha256: sha256,
                    deliveredToFrame,
                    deliveryMode,
                    deliveryCheckedAtMs: now,
                    uploaderUserId: (0, app_user_jwt_1.verifyUserJwtBearer)(req)?.userId,
                });
                if (draft.uploads.length > 2000) {
                    draft.uploads = draft.uploads.slice(0, 2000);
                }
                pruneOldUploads();
                draft.auditLog.unshift({
                    id: `audit_${now}_${Math.random().toString(16).slice(2, 8)}`,
                    actor: "api_upload",
                    action: "photo_uploaded",
                    target: deviceId || draft.device.id,
                    atMs: now,
                    meta: {
                        filename: mqttBasename,
                        bytes: persistedDiskBytes,
                        deliveredToFrame,
                        deliveryMode,
                    },
                });
            });
            {
                const uploaderId = (0, app_user_jwt_1.verifyUserJwtBearer)(req)?.userId;
                (0, firebase_admin_1.sendPushToFrameSubscribers)(deviceId || store_1.db.read().device.id, "New Photo Uploaded", `A photo was uploaded to your frame${deviceId ? " (" + deviceId + ")" : ""}.`, { alsoNotifyUserId: uploaderId });
            }
            res.json({
                ok: true,
                received_bytes: buf.length,
                declared_size: declaredSize,
                stored_path: mqttBasename,
                frame_play_basename: mqttBasename,
                preview_stored_path: jpegBackupStoredPath,
                myfm_sidecar: playbackMyfmBin,
                myfm_file_bytes: playbackMyfmBin && fs_1.default.existsSync(path_1.default.join(uploadDir, mqttBasename))
                    ? fs_1.default.statSync(path_1.default.join(uploadDir, mqttBasename)).size
                    : null,
                device_id: deviceId || "unknown",
                checksum_sha256: sha256,
                client_checksum: clientChecksum || null,
                matches_declared_size: declaredSize === buf.length,
                slideshow_style: slideshowStyle || null,
                transport: transport || null,
                delivered_to_frame: deliveredToFrame,
                delivery_mode: deliveryMode,
                queued: queued,
                image_url: imageUrl,
                image_processing: imageProcessing,
            });
        }
        catch (e) {
            res.status(500).json({
                ok: false,
                error: e instanceof Error ? e.message : "upload_failed",
            });
        }
    }
    router.post("/frames/:mac/upload", security_1.requirePairingToken, security_1.uploadRateLimit, upload.single("photo"), async (req, res) => {
        const mac = (0, frame_mqtt_1.resolveMqttHardwareMac)(String(req.params.mac ?? ""));
        if (!mac) {
            res.status(400).json({ ok: false, error: "invalid_mac" });
            return;
        }
        await handleFrameUpload(req, res, mac);
    });
    router.post("/invite/:code/upload", security_1.uploadRateLimit, upload.single("photo"), async (req, res) => {
        const code = String(req.params.code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (code.length !== 8) {
            res.status(400).json({ ok: false, error: "invalid_invite_code" });
            return;
        }
        const { lookupFrameInviteDeviceId } = await Promise.resolve().then(() => __importStar(require("../services/frame_guest_invite")));
        const deviceId = lookupFrameInviteDeviceId(code);
        if (!deviceId) {
            res.status(404).json({ ok: false, error: "invite_not_found" });
            return;
        }
        await handleFrameUpload(req, res, deviceId);
    });
    router.post("/invite/:code/upload-raw", express_1.default.raw({ type: "*/*", limit: "15mb" }), security_1.uploadRateLimit, async (req, res) => {
        const code = String(req.params.code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (code.length !== 8) {
            res.status(400).json({ ok: false, error: "invalid_invite_code" });
            return;
        }
        const buf = req.body;
        if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
            res.status(400).json({ ok: false, error: "missing_photo_data" });
            return;
        }
        const { lookupFrameInviteDeviceId } = await Promise.resolve().then(() => __importStar(require("../services/frame_guest_invite")));
        const deviceId = lookupFrameInviteDeviceId(code);
        if (!deviceId) {
            res.status(404).json({ ok: false, error: "invite_not_found" });
            return;
        }
        const ext = ".jpg";
        const filename = `${Date.now()}_guest_upload${ext}`;
        const filePath = path_1.default.join(uploadDir, filename);
        fs_1.default.writeFileSync(filePath, buf);
        req.file = {
            fieldname: "photo",
            originalname: filename,
            encoding: "7bit",
            mimetype: req.headers["content-type"] ?? "image/jpeg",
            destination: uploadDir,
            filename,
            path: filePath,
            size: buf.length,
            stream: fs_1.default.createReadStream(filePath),
            buffer: buf,
        };
        await handleFrameUpload(req, res, deviceId);
    });
    router.get("/photo/delivery-status", security_1.requirePairingToken, (req, res) => {
        const checksum = String(req.query.checksum ?? "").trim().toLowerCase();
        const deviceId = String(req.query.device_id ?? "").trim();
        if (!checksum) {
            res.status(400).json({ ok: false, error: "missing_checksum" });
            return;
        }
        const data = store_1.db.read();
        const match = data.uploads.find((u) => u.checksumSha256.toLowerCase() === checksum && (!deviceId || u.deviceId === deviceId));
        if (!match) {
            res.json({ ok: true, found: false, delivered_to_frame: false, delivery_mode: "unknown" });
            return;
        }
        res.json({
            ok: true,
            found: true,
            upload_id: match.id,
            device_id: match.deviceId,
            delivered_to_frame: match.deliveredToFrame === true,
            delivery_mode: match.deliveryMode ?? "stored_only",
            checked_at_ms: match.deliveryCheckedAtMs ?? match.atMs,
            uploaded_at_ms: match.atMs,
        });
    });
    return router;
}
