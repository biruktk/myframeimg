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
exports.userGalleryRouter = userGalleryRouter;
const crypto_1 = __importDefault(require("crypto"));
const express_1 = __importStar(require("express"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const frame_media_1 = require("../config/frame_media");
const store_1 = require("../db/store");
const app_user_jwt_1 = require("../services/app_user_jwt");
const user_gallery_service_1 = require("../services/user_gallery_service");
function authUser(req, res) {
    const u = (0, app_user_jwt_1.verifyUserJwtBearer)(req);
    if (!u) {
        res.status(401).json({ ok: false, error: "unauthorized" });
        return null;
    }
    return u;
}
function safeUploadBasename(raw) {
    const trimmed = String(raw || "").trim();
    if (!trimmed)
        return null;
    let name = trimmed;
    try {
        if (trimmed.includes("://")) {
            name = decodeURIComponent(path_1.default.basename(new URL(trimmed).pathname));
        }
    }
    catch {
        return null;
    }
    const base = path_1.default.basename(name);
    if (!base || base.includes("..") || base.includes("/") || base.includes("\\"))
        return null;
    return base;
}
function galleryItemJson(item, mediaBase) {
    const thumbPath = `/frame-media/${encodeURIComponent(item.previewFilename)}`;
    const base = mediaBase.replace(/\/$/, "");
    return {
        id: item.id,
        atMs: item.atMs,
        deviceId: item.deviceId ?? null,
        previewFilename: item.previewFilename,
        thumbUrl: thumbPath,
        url: `${base}${thumbPath}`,
    };
}
function userGalleryRouter(uploadDir, publicBaseUrl) {
    const router = (0, express_1.Router)();
    const mediaBase = (0, frame_media_1.normalizedFrameMediaBaseUrl)(publicBaseUrl) || publicBaseUrl.replace(/\/$/, "");
    const storage = multer_1.default.diskStorage({
        destination: (_req, _file, cb) => cb(null, uploadDir),
        filename: (_req, file, cb) => {
            const ext = path_1.default.extname(file.originalname || ".jpg").toLowerCase() || ".jpg";
            const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
            cb(null, `gallery_${Date.now()}_${crypto_1.default.randomBytes(4).toString("hex")}${safeExt}`);
        },
    });
    const upload = (0, multer_1.default)({ storage, limits: { fileSize: 32 * 1024 * 1024 } });
    router.use(express_1.default.json({ limit: "64kb" }));
    /** GET /api/user/gallery — last 20 photos for signed-in user (all login providers). */
    router.get("/user/gallery", (req, res) => {
        const auth = authUser(req, res);
        if (!auth)
            return;
        const data = store_1.db.read();
        const photos = (0, user_gallery_service_1.listUserGalleryPhotos)(data, auth.userId);
        res.json({
            ok: true,
            maxPhotos: user_gallery_service_1.USER_GALLERY_MAX_PER_USER,
            photos: photos.map((p) => galleryItemJson(p, mediaBase)),
        });
    });
    /** POST /api/user/gallery — save to account library (optional; frame send also registers via JWT on /photo/upload). */
    router.post("/user/gallery", upload.single("file"), (req, res) => {
        const auth = authUser(req, res);
        if (!auth)
            return;
        const file = req.file;
        if (!file) {
            res.status(400).json({ ok: false, error: "missing_file" });
            return;
        }
        const storedName = safeUploadBasename(file.filename || path_1.default.basename(file.path));
        if (!storedName) {
            res.status(400).json({ ok: false, error: "invalid_uploaded_filename" });
            return;
        }
        const deviceId = String(req.body?.device_id ?? req.body?.deviceId ?? "").trim() || undefined;
        let entry;
        store_1.db.mutate((draft) => {
            entry = (0, user_gallery_service_1.registerUserGalleryPhoto)(draft, auth.userId, storedName, { deviceId });
        });
        res.status(201).json({
            ok: true,
            photo: galleryItemJson(entry, mediaBase),
        });
    });
    return router;
}
