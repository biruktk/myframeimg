"use strict";
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
const frame_mqtt_1 = require("../services/frame_mqtt");
const app_user_jwt_1 = require("../services/app_user_jwt");
const user_gallery_service_1 = require("../services/user_gallery_service");
const frame_guest_invite_1 = require("../services/frame_guest_invite");
const myfm_encode_1 = require("../services/myfm_encode");
const image_edits_1 = require("../services/image_edits");
/**
 * POST /api/photo/upload
 * Multipart: field `file` (binary), body fields: filename, device_id, checksum, size
 * As described in `ra/api/Image_Processing_API_Integration.md` step 6.
 */
function photoRouter(uploadDir, publicBaseUrl) {
    const router = express_1.default.Router();
    const base = publicBaseUrl.replace(/\/$/, "");
    function safeUploadBasename(raw) {
        const trimmed = String(raw || "").trim();
        if (!trimmed)
            return null;
        let name = trimmed;
        try {
            if (trimmed.includes("://")) {
                name = decodeURIComponent(path_1.default.basename(new URL(trimmed).pathname));
            }
            else {
                name = decodeURIComponent(path_1.default.basename(trimmed));
            }
        }
        catch {
            name = path_1.default.basename(trimmed);
        }
        name = path_1.default.basename(name).trim();
        if (!name || name === "." || name === "..")
            return null;
        if (/^[0-9]{1,3}(?:\.[0-9]{1,3}){3}$/.test(name))
            return null;
        if (!name.includes("."))
            return null;
        return name.replace(/[^a-zA-Z0-9._-]/g, "_");
    }
    function localUploadFilePath(raw) {
        const name = safeUploadBasename(raw);
        return name ? path_1.default.join(uploadDir, name) : null;
    }
    const storage = multer_1.default.diskStorage({
        destination: (_req, _file, cb) => cb(null, uploadDir),
        filename: (_req, file, cb) => {
            const original = path_1.default.basename(String(file.originalname || "")).trim();
            const safe = original.replace(/[^a-zA-Z0-9._-]/g, "_");
            const name = `${Date.now()}_${safe || "upload.bin"}`.trim();
            cb(null, name);
        },
    });
    const upload = (0, multer_1.default)({
        storage,
        limits: { fileSize: 15 * 1024 * 1024 },
    });
    const frameMacUploadHandler = async (req, res) => {
        try {
            const file = req.file;
            if (!file) {
                res.status(400).json({ ok: false, error: "missing_file" });
                return;
            }
            const deviceId = String(req.frameInviteDeviceId ??
                req.params.mac ??
                req.body.mac ??
                req.body.device_id ??
                "");
            const clientChecksum = String(req.body.checksum ?? "");
            const declaredSize = Number(req.body.size ?? file.size);
            const slideshowStyle = String(req.body.slideshow_style ?? "").trim();
            const transport = String(req.body.transport ?? "").trim();
            const storedName = safeUploadBasename(file.filename || path_1.default.basename(file.path));
            if (!storedName) {
                res.status(400).json({ ok: false, error: "invalid_uploaded_filename" });
                return;
            }
            const filePath = path_1.default.join(uploadDir, storedName);
            let buf = fs_1.default.readFileSync(filePath);
            const basename = storedName;
            // Apply edits sent from app (crop, rotate, filter, overlays).  Returns .bin directly.
            const editsRaw = String(req.body.edits ?? "").trim();
            let editsApplied = false;
            if (editsRaw) {
                try {
                    const edits = JSON.parse(editsRaw);
                    buf = Buffer.from(await (0, image_edits_1.applyEdits)(buf, edits));
                    editsApplied = true;
                }
                catch (err) {
                    console.error("[photo] edits apply failed:", err);
                }
            }
            const encodeMyfm = String(process.env.FRAME_MYFM_ENCODE ?? "1").trim() !== "0";
            let mqttBasename = basename;
            if (editsApplied) {
                const stem = path_1.default.basename(basename, path_1.default.extname(basename));
                mqttBasename = `${stem}.bin`;
                fs_1.default.writeFileSync(path_1.default.join(uploadDir, mqttBasename), buf);
            }
            else if ((0, myfm_encode_1.isProbablyMyfmBuffer)(buf)) {
                mqttBasename = basename;
            }
            else if (encodeMyfm) {
                try {
                    mqttBasename = await (0, myfm_encode_1.writeMyfmFromBuffer)(buf, uploadDir, basename.replace(/\.[^.]+$/, ''));
                }
                catch (err) {
                    const detail = err instanceof Error ? err.message : String(err);
                    console.error("[photo] MYFM encode failed:", detail);
                    res.status(503).json({
                        ok: false,
                        error: "myfm_encode_failed",
                        message: detail,
                        hint: "XT ePaper / ESP32 only renders MYFM .bin. Fix sharp/libvips on the server, ensure FRAME_MYFM_ENCODE=1, and rebuild. JPEG/PNG is never sent to MQTT.",
                    });
                    return;
                }
            }
            const sha256 = crypto_1.default.createHash("sha256").update(buf).digest("hex");
            const imageUrl = `${base}/frame-media/${encodeURIComponent(mqttBasename)}`;
            let persistedDiskBytes = buf.length;
            let jpegBackupStoredPath = null;
            if (editsApplied && fs_1.default.existsSync(filePath)) {
                jpegBackupStoredPath = basename;
                persistedDiskBytes = fs_1.default.statSync(filePath).size + buf.length;
            }
            else if (mqttBasename !== basename &&
                mqttBasename.toLowerCase().endsWith(".bin") &&
                path_1.default.extname(basename).toLowerCase() !== ".bin" &&
                fs_1.default.existsSync(filePath)) {
                jpegBackupStoredPath = basename;
                try {
                    const mqttPath = localUploadFilePath(mqttBasename);
                    const binSz = mqttPath != null && fs_1.default.existsSync(mqttPath) ? fs_1.default.statSync(mqttPath).size : 0;
                    persistedDiskBytes = buf.length + binSz;
                }
                catch {
                    persistedDiskBytes = buf.length;
                }
            }
            const playbackMyfmBin = mqttBasename.toLowerCase().endsWith(".bin");
            let deliveredToFrame = false;
            let deliveryMode = "stored_only";
            const mqttMac = (0, frame_mqtt_1.resolveKnownMqttHardwareMac)(deviceId);
            if (mqttMac) {
                if (!(0, frame_mqtt_1.isMqttConnected)()) {
                    deliveryMode = "mqtt_disconnected";
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
                        // Snapshot liveness BEFORE publishPlayImage mutates lastAction to "play".
                        const wasOnline = (0, frame_mqtt_1.isFrameMqttOnline)(deviceId);
                        await (0, frame_mqtt_1.publishPlayImage)(deviceId, imageUrl, publicHost || undefined);
                        if (wasOnline || (0, frame_mqtt_1.isFrameMqttOnline)(deviceId)) {
                            deliveredToFrame = true;
                            deliveryMode = "mqtt_published";
                        }
                        else {
                            deliveryMode = "mqtt_published_unconfirmed";
                        }
                    }
                    catch (err) {
                        console.error("[photo] MQTT play publish failed:", err);
                        deliveryMode = "mqtt_publish_failed";
                    }
                }
            }
            const now = Date.now();
            store_1.db.mutate((draft) => {
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
                    id: `${now}-${Math.random().toString(16).slice(2, 8)}`,
                    filename: mqttBasename,
                    bytes: persistedDiskBytes,
                    deviceId: deviceId || draft.device.id,
                    atMs: now,
                    checksumSha256: sha256,
                    deliveredToFrame,
                    deliveryMode,
                    deliveryCheckedAtMs: now,
                });
                if (draft.uploads.length > 2000) {
                    draft.uploads = draft.uploads.slice(0, 2000);
                }
                draft.auditLog.unshift({
                    id: `audit_${now}_${Math.random().toString(16).slice(2, 8)}`,
                    actor: "api_frame_upload",
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
                myfm_file_bytes: (() => {
                    const mqttPath = playbackMyfmBin ? localUploadFilePath(mqttBasename) : null;
                    return mqttPath != null && fs_1.default.existsSync(mqttPath) ? fs_1.default.statSync(mqttPath).size : null;
                })(),
                device_id: deviceId || "unknown",
                checksum_sha256: sha256,
                client_checksum: clientChecksum || null,
                matches_declared_size: declaredSize === buf.length,
                slideshow_style: slideshowStyle || null,
                transport: transport || null,
                delivered_to_frame: deliveredToFrame,
                delivery_mode: deliveryMode,
                image_url: imageUrl,
            });
        }
        catch (e) {
            res.status(500).json({
                ok: false,
                error: e instanceof Error ? e.message : "upload_failed",
            });
        }
    };
    router.post("/frames/:mac/upload", security_1.requirePairingTokenOrInvite, security_1.uploadRateLimit, upload.single("photo"), frameMacUploadHandler);
    router.post("/invite/:code/upload", (req, res, next) => {
        const code = String(req.params.code ?? "")
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "");
        if (code.length !== 8) {
            res.status(400).json({ ok: false, error: "invalid_invite_code" });
            return;
        }
        const deviceId = (0, frame_guest_invite_1.lookupFrameInviteDeviceId)(code);
        if (!deviceId) {
            res.status(404).json({ ok: false, error: "invite_not_found" });
            return;
        }
        req.frameInviteDeviceId = deviceId;
        next();
    }, security_1.requirePairingTokenOrInvite, security_1.uploadRateLimit, upload.single("photo"), frameMacUploadHandler);
    router.post("/photo/upload", security_1.requirePairingTokenOrInvite, security_1.uploadRateLimit, upload.single("file"), async (req, res) => {
        const galleryAuthed = (0, app_user_jwt_1.verifyUserJwtBearer)(req);
        try {
            const file = req.file;
            if (!file) {
                res.status(400).json({ ok: false, error: "missing_file" });
                return;
            }
            const inviteDevice = req.frameInviteDeviceId;
            let deviceId = String(req.body.device_id ?? req.body.deviceId ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
            if (inviteDevice) {
                if (deviceId && deviceId !== inviteDevice) {
                    res.status(400).json({ ok: false, error: "invite_device_mismatch" });
                    return;
                }
                deviceId = inviteDevice;
            }
            const clientChecksum = String(req.body.checksum ?? "");
            const declaredSize = Number(req.body.size ?? file.size);
            const slideshowStyle = String(req.body.slideshow_style ?? "").trim();
            const transport = String(req.body.transport ?? "").trim();
            const storedName = safeUploadBasename(file.filename || path_1.default.basename(file.path));
            if (!storedName) {
                res.status(400).json({ ok: false, error: "invalid_uploaded_filename" });
                return;
            }
            const filePath = path_1.default.join(uploadDir, storedName);
            const buf = fs_1.default.readFileSync(filePath);
            const sha256 = crypto_1.default.createHash("sha256").update(buf).digest("hex");
            const basename = storedName;
            const ext = path_1.default.extname(basename).toLowerCase();
            const encodeMyfm = String(process.env.FRAME_MYFM_ENCODE ?? "1").trim() !== "0";
            const looksLikeRaster = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) || (buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8);
            let mqttBasename = basename;
            if ((0, myfm_encode_1.isProbablyMyfmBuffer)(buf)) {
                mqttBasename = basename;
            }
            else if (encodeMyfm && looksLikeRaster) {
                try {
                    mqttBasename = await (0, myfm_encode_1.writeMyfmSidecar)(filePath);
                }
                catch (err) {
                    const detail = err instanceof Error ? err.message : String(err);
                    console.error("[photo] MYFM encode failed:", detail);
                    res.status(503).json({
                        ok: false,
                        error: "myfm_encode_failed",
                        message: detail,
                        hint: "XT ePaper / ESP32 only renders MYFM .bin. Fix sharp/libvips on the server, ensure FRAME_MYFM_ENCODE=1, and rebuild. JPEG/PNG is never sent to MQTT.",
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
                fs_1.default.existsSync(filePath)) {
                jpegBackupStoredPath = basename;
                try {
                    const mqttPath = localUploadFilePath(mqttBasename);
                    const binSz = mqttPath != null && fs_1.default.existsSync(mqttPath) ? fs_1.default.statSync(mqttPath).size : 0;
                    persistedDiskBytes = buf.length + binSz;
                }
                catch {
                    persistedDiskBytes = buf.length;
                }
            }
            const playbackMyfmBin = mqttBasename.toLowerCase().endsWith(".bin");
            let deliveredToFrame = false;
            let deliveryMode = "stored_only";
            const mqttMac = (0, frame_mqtt_1.resolveKnownMqttHardwareMac)(deviceId);
            if (mqttMac) {
                if (!(0, frame_mqtt_1.isMqttConnected)()) {
                    deliveryMode = "mqtt_disconnected";
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
                        // Snapshot liveness BEFORE publishPlayImage mutates lastAction to "play".
                        const wasOnline = (0, frame_mqtt_1.isFrameMqttOnline)(deviceId);
                        await (0, frame_mqtt_1.publishPlayImage)(deviceId, imageUrl, publicHost || undefined);
                        if (wasOnline || (0, frame_mqtt_1.isFrameMqttOnline)(deviceId)) {
                            deliveredToFrame = true;
                            deliveryMode = "mqtt_published";
                        }
                        else {
                            deliveryMode = "mqtt_published_unconfirmed";
                        }
                    }
                    catch (err) {
                        console.error("[photo] MQTT play publish failed:", err);
                        deliveryMode = "mqtt_publish_failed";
                    }
                }
            }
            const now = Date.now();
            store_1.db.mutate((draft) => {
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
                    id: `${now}-${Math.random().toString(16).slice(2, 8)}`,
                    filename: mqttBasename,
                    bytes: persistedDiskBytes,
                    deviceId: deviceId || draft.device.id,
                    atMs: now,
                    checksumSha256: sha256,
                    deliveredToFrame,
                    deliveryMode,
                    deliveryCheckedAtMs: now,
                });
                if (draft.uploads.length > 2000) {
                    draft.uploads = draft.uploads.slice(0, 2000);
                }
                if (galleryAuthed) {
                    const previewForGallery = jpegBackupStoredPath ?? (ext !== ".bin" ? basename : null);
                    if (previewForGallery) {
                        (0, user_gallery_service_1.registerUserGalleryPhoto)(draft, galleryAuthed.userId, previewForGallery, {
                            deviceId: deviceId || draft.device.id,
                        });
                    }
                }
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
                myfm_file_bytes: (() => {
                    const mqttPath = playbackMyfmBin ? localUploadFilePath(mqttBasename) : null;
                    return mqttPath != null && fs_1.default.existsSync(mqttPath) ? fs_1.default.statSync(mqttPath).size : null;
                })(),
                device_id: deviceId || "unknown",
                checksum_sha256: sha256,
                client_checksum: clientChecksum || null,
                matches_declared_size: declaredSize === buf.length,
                slideshow_style: slideshowStyle || null,
                transport: transport || null,
                delivered_to_frame: deliveredToFrame,
                delivery_mode: deliveryMode,
                image_url: imageUrl,
            });
        }
        catch (e) {
            res.status(500).json({
                ok: false,
                error: e instanceof Error ? e.message : "upload_failed",
            });
        }
    });
    router.get("/photo/delivery-status", security_1.requirePairingTokenOrInvite, (req, res) => {
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
