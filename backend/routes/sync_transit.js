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
exports.syncTransitRouter = void 0;
exports.cleanupExpiredTransit = cleanupExpiredTransit;
exports.startTransitCleanupJob = startTransitCleanupJob;
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const express_1 = __importStar(require("express"));
const multer_1 = __importDefault(require("multer"));
const store_1 = require("../db/store");
const app_user_jwt_1 = require("../services/app_user_jwt");
const account_sync_state_1 = require("../services/account_sync_state");
const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const MAX_BYTES = 25 * 1024 * 1024;
exports.syncTransitRouter = (0, express_1.Router)();
exports.syncTransitRouter.use(express_1.default.json({ limit: "256kb" }));
function transitRoot() {
    const packageRoot = path_1.default.resolve(__dirname, "../..");
    const dir = path_1.default.resolve(packageRoot, process.env.TRANSIT_DIR || "uploads/transit");
    if (!fs_1.default.existsSync(dir))
        fs_1.default.mkdirSync(dir, { recursive: true });
    return dir;
}
function authed(req, res) {
    const user = (0, app_user_jwt_1.verifyUserJwtBearer)(req);
    if (!user) {
        res.status(401).json({ ok: false, error: "unauthorized" });
        return null;
    }
    return user;
}
const upload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: (_req, _file, cb) => cb(null, transitRoot()),
        filename: (_req, file, cb) => {
            const safe = String(file.originalname || "blob")
                .replace(/[^a-zA-Z0-9._-]/g, "_")
                .slice(0, 80);
            cb(null, `${Date.now()}_${crypto_1.default.randomBytes(6).toString("hex")}_${safe}`);
        },
    }),
    limits: { fileSize: MAX_BYTES, files: 1 },
});
function deletePackageFiles(pkg) {
    try {
        const fp = path_1.default.join(transitRoot(), path_1.default.basename(pkg.storedName));
        if (fs_1.default.existsSync(fp))
            fs_1.default.unlinkSync(fp);
    }
    catch {
        /* ignore */
    }
}
/** Sweep expired / consumed packages. Safe to call often. */
function cleanupExpiredTransit() {
    const now = Date.now();
    let removed = 0;
    store_1.db.mutate((draft) => {
        if (!Array.isArray(draft.syncTransitPackages))
            draft.syncTransitPackages = [];
        const keep = [];
        for (const p of draft.syncTransitPackages) {
            const expired = p.expiresAtMs <= now;
            const consumed = p.consumedAtMs != null;
            if (expired || consumed) {
                deletePackageFiles(p);
                removed += 1;
            }
            else {
                keep.push(p);
            }
        }
        draft.syncTransitPackages = keep;
    });
    return { removed };
}
/** POST /api/v1/sync/transit — upload ephemeral media package (TTL 2h). */
exports.syncTransitRouter.post("/v1/sync/transit", (req, res) => {
    const user = authed(req, res);
    if (!user)
        return;
    upload.single("file")(req, res, (err) => {
        if (err) {
            res.status(400).json({ ok: false, error: "upload_failed", detail: String(err.message || err) });
            return;
        }
        const file = req.file;
        if (!file) {
            res.status(400).json({ ok: false, error: "missing_file" });
            return;
        }
        if (!file.size || file.size <= 0) {
            try {
                fs_1.default.unlinkSync(file.path);
            }
            catch {
                /* ignore */
            }
            res.status(400).json({ ok: false, error: "empty_upload" });
            return;
        }
        const id = `tr_${Date.now().toString(36)}_${crypto_1.default.randomBytes(4).toString("hex")}`;
        const now = Date.now();
        const expiresAtMs = now + TTL_MS;
        const label = String((req.body && req.body.label) || file.originalname || "transit").slice(0, 120);
        store_1.db.mutate((draft) => {
            if (!Array.isArray(draft.syncTransitPackages))
                draft.syncTransitPackages = [];
            draft.syncTransitPackages.push({
                id,
                userId: user.userId,
                filename: label,
                storedName: path_1.default.basename(file.filename),
                bytes: file.size,
                createdAtMs: now,
                expiresAtMs,
                consumedAtMs: null,
            });
            const u = draft.users.find((x) => x.id === user.userId);
            if (u)
                (0, account_sync_state_1.bumpUserSyncVersion)(u);
        });
        res.json({
            ok: true,
            package_id: id,
            expires_at: expiresAtMs,
            bytes: file.size,
            download_path: `/api/v1/sync/transit/${encodeURIComponent(id)}`,
        });
    });
});
/** GET /api/v1/sync/transit — list pending packages for the caller. */
exports.syncTransitRouter.get("/v1/sync/transit", (req, res) => {
    const user = authed(req, res);
    if (!user)
        return;
    cleanupExpiredTransit();
    const data = store_1.db.read();
    const now = Date.now();
    const items = (data.syncTransitPackages ?? [])
        .filter((p) => p.userId === user.userId && !p.consumedAtMs && p.expiresAtMs > now)
        .map((p) => ({
        package_id: p.id,
        filename: p.filename,
        bytes: p.bytes,
        created_at: p.createdAtMs,
        expires_at: p.expiresAtMs,
        download_path: `/api/v1/sync/transit/${encodeURIComponent(p.id)}`,
    }));
    res.json({ ok: true, packages: items });
});
/**
 * GET /api/v1/sync/transit/:packageId
 * Download once (or until TTL). Deletes file immediately after successful send.
 */
exports.syncTransitRouter.get("/v1/sync/transit/:packageId", (req, res) => {
    const user = authed(req, res);
    if (!user)
        return;
    const packageId = String(req.params.packageId ?? "").trim();
    const data = store_1.db.read();
    const pkg = (data.syncTransitPackages ?? []).find((p) => p.id === packageId);
    if (!pkg || pkg.userId !== user.userId) {
        res.status(404).json({ ok: false, error: "not_found" });
        return;
    }
    if (pkg.consumedAtMs != null || pkg.expiresAtMs <= Date.now()) {
        cleanupExpiredTransit();
        res.status(410).json({ ok: false, error: "expired_or_consumed" });
        return;
    }
    const fp = path_1.default.join(transitRoot(), path_1.default.basename(pkg.storedName));
    if (!fs_1.default.existsSync(fp)) {
        store_1.db.mutate((draft) => {
            draft.syncTransitPackages = (draft.syncTransitPackages ?? []).filter((p) => p.id !== packageId);
        });
        res.status(404).json({ ok: false, error: "file_missing" });
        return;
    }
    res.download(fp, pkg.filename || path_1.default.basename(fp), (err) => {
        if (err) {
            if (!res.headersSent)
                res.status(500).json({ ok: false, error: "download_failed" });
            return;
        }
        // Delete immediately after client download (server-as-transient-transit).
        store_1.db.mutate((draft) => {
            const row = (draft.syncTransitPackages ?? []).find((p) => p.id === packageId);
            if (row)
                row.consumedAtMs = Date.now();
        });
        deletePackageFiles(pkg);
        cleanupExpiredTransit();
    });
});
/** DELETE /api/v1/sync/transit/:packageId — cancel pending package. */
exports.syncTransitRouter.delete("/v1/sync/transit/:packageId", (req, res) => {
    const user = authed(req, res);
    if (!user)
        return;
    const packageId = String(req.params.packageId ?? "").trim();
    let found = false;
    store_1.db.mutate((draft) => {
        const list = draft.syncTransitPackages ?? [];
        const idx = list.findIndex((p) => p.id === packageId && p.userId === user.userId);
        if (idx >= 0) {
            found = true;
            deletePackageFiles(list[idx]);
            list.splice(idx, 1);
            draft.syncTransitPackages = list;
            const u = draft.users.find((x) => x.id === user.userId);
            if (u)
                (0, account_sync_state_1.bumpUserSyncVersion)(u);
        }
    });
    if (!found) {
        res.status(404).json({ ok: false, error: "not_found" });
        return;
    }
    res.json({ ok: true });
});
/** Start periodic TTL sweeper (call once from index). */
function startTransitCleanupJob(intervalMs = 10 * 60 * 1000) {
    cleanupExpiredTransit();
    return setInterval(() => {
        try {
            cleanupExpiredTransit();
        }
        catch (e) {
            console.error("[transit] cleanup failed", e);
        }
    }, intervalMs);
}
