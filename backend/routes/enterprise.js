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
exports.enterpriseRouter = enterpriseRouter;
const crypto_1 = __importDefault(require("crypto"));
const express_1 = __importStar(require("express"));
const fs_1 = __importDefault(require("fs"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const store_1 = require("../db/store");
const enterprise_api_keys_1 = require("../services/enterprise_api_keys");
const app_user_jwt_1 = require("../services/app_user_jwt");
const firebase_admin_1 = require("../services/firebase_admin");
function readBearer(req) {
    const raw = String(req.header("authorization") ?? "").trim();
    const m = raw.match(/^Bearer\s+(.+)$/i);
    return (m?.[1] ?? "").trim() || null;
}
function readAdminToken(req) {
    return (readBearer(req) ?? String(req.header("x-admin-token") ?? "")).trim();
}
function isAdmin(req) {
    const expected = String(process.env.ADMIN_TOKEN ?? "").trim();
    if (!expected)
        return false;
    const got = readAdminToken(req);
    return got.length > 0 && got === expected;
}
function parseDeviceIds(raw) {
    if (Array.isArray(raw))
        return raw.map((x) => String(x ?? "").trim()).filter(Boolean);
    const text = String(raw ?? "").trim();
    if (!text)
        return [];
    return text.split(",").map((x) => x.trim()).filter(Boolean);
}
function ensureOrgAccess(req, orgId, neededScope) {
    if (isAdmin(req))
        return { ok: true, actor: "admin" };
    const principal = (0, enterprise_api_keys_1.authenticateEnterpriseApiKey)(req);
    if (!principal)
        return { ok: false, status: 401, body: { ok: false, error: "missing_or_invalid_api_key" } };
    if (principal.orgId !== orgId)
        return { ok: false, status: 403, body: { ok: false, error: "org_access_denied" } };
    if (!(0, enterprise_api_keys_1.hasScope)(principal, neededScope)) {
        return { ok: false, status: 403, body: { ok: false, error: "missing_scope", needed_scope: neededScope } };
    }
    return { ok: true, actor: "api_key", principal };
}
function enterpriseRouter(uploadDir, publicBaseUrl) {
    const router = (0, express_1.Router)();
    const mediaBase = publicBaseUrl.replace(/\/$/, "");
    const storage = multer_1.default.diskStorage({
        destination: (_req, _file, cb) => cb(null, uploadDir),
        filename: (_req, file, cb) => {
            const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
            cb(null, `${Date.now()}_${safe || "upload.bin"}`);
        },
    });
    const upload = (0, multer_1.default)({ storage, limits: { fileSize: 20 * 1024 * 1024 } });
    router.use(express_1.default.json({ limit: "1mb" }));
    router.get("/enterprise/orgs", (req, res) => {
        if (!isAdmin(req)) {
            res.status(401).json({ ok: false, error: "unauthorized_admin_token" });
            return;
        }
        const data = store_1.db.read();
        const keyCounts = new Map();
        for (const key of data.enterpriseApiKeys) {
            if (key.revokedAtMs == null)
                keyCounts.set(key.orgId, (keyCounts.get(key.orgId) ?? 0) + 1);
        }
        res.json({
            ok: true,
            orgs: data.organizations.map((o) => ({
                ...o,
                apiKeyCount: keyCounts.get(o.id) ?? 0,
                deviceCount: data.frames.filter((f) => f.orgId === o.id).length,
            })),
        });
    });
    router.post("/enterprise/orgs", (req, res) => {
        if (!isAdmin(req)) {
            res.status(401).json({ ok: false, error: "unauthorized_admin_token" });
            return;
        }
        const name = String(req.body?.name ?? "").trim();
        if (!name) {
            res.status(400).json({ ok: false, error: "name_required" });
            return;
        }
        const id = `org_${crypto_1.default.randomBytes(5).toString("hex")}`;
        const now = Date.now();
        store_1.db.mutate((draft) => {
            draft.organizations.push({ id, name, status: "active", createdAtMs: now });
        });
        res.status(201).json({ ok: true, org: { id, name, status: "active", createdAtMs: now } });
    });
    router.post("/enterprise/orgs/:orgId/api-keys", (req, res) => {
        if (!isAdmin(req)) {
            res.status(401).json({ ok: false, error: "unauthorized_admin_token" });
            return;
        }
        const orgId = String(req.params.orgId);
        const name = String(req.body?.name ?? "Default Key").trim();
        const requestedScopes = Array.isArray(req.body?.scopes) ? req.body.scopes.map((s) => String(s)) : [];
        const allowedScopes = ["devices:read", "images:write", "images:read", "commands:write"];
        const scopes = (requestedScopes.length ? requestedScopes : ["devices:read", "images:write"]).filter((s) => allowedScopes.includes(s));
        if (scopes.length === 0) {
            res.status(400).json({ ok: false, error: "invalid_scopes" });
            return;
        }
        const data = store_1.db.read();
        if (!data.organizations.some((o) => o.id === orgId)) {
            res.status(404).json({ ok: false, error: "org_not_found" });
            return;
        }
        const key = (0, enterprise_api_keys_1.generateEnterpriseApiKey)();
        const now = Date.now();
        store_1.db.mutate((draft) => {
            draft.enterpriseApiKeys.push({
                id: key.keyId,
                orgId,
                name: name || "Default Key",
                keyPrefix: key.token.slice(0, 12),
                secretHash: (0, enterprise_api_keys_1.hashApiSecret)(key.keySecret),
                createdAtMs: now,
                lastUsedAtMs: null,
                expiresAtMs: null,
                revokedAtMs: null,
                scopes,
            });
        });
        res.status(201).json({
            ok: true,
            apiKey: {
                id: key.keyId,
                orgId,
                name: name || "Default Key",
                scopes,
                createdAtMs: now,
            },
            token: key.token,
            note: "Store this token now. It will not be returned again.",
        });
    });
    router.get("/enterprise/orgs/:orgId/api-keys", (req, res) => {
        if (!isAdmin(req)) {
            res.status(401).json({ ok: false, error: "unauthorized_admin_token" });
            return;
        }
        const orgId = String(req.params.orgId);
        const data = store_1.db.read();
        const keys = data.enterpriseApiKeys
            .filter((k) => k.orgId === orgId)
            .map((k) => ({
            id: k.id,
            orgId: k.orgId,
            name: k.name,
            keyPrefix: k.keyPrefix,
            scopes: k.scopes,
            createdAtMs: k.createdAtMs,
            lastUsedAtMs: k.lastUsedAtMs,
            expiresAtMs: k.expiresAtMs,
            revokedAtMs: k.revokedAtMs,
        }));
        res.json({ ok: true, keys });
    });
    router.post("/enterprise/orgs/:orgId/api-keys/:keyId/revoke", (req, res) => {
        if (!isAdmin(req)) {
            res.status(401).json({ ok: false, error: "unauthorized_admin_token" });
            return;
        }
        const orgId = String(req.params.orgId);
        const keyId = String(req.params.keyId);
        let found = false;
        store_1.db.mutate((draft) => {
            draft.enterpriseApiKeys = draft.enterpriseApiKeys.map((k) => {
                if (k.id !== keyId || k.orgId !== orgId)
                    return k;
                found = true;
                return { ...k, revokedAtMs: Date.now() };
            });
        });
        if (!found) {
            res.status(404).json({ ok: false, error: "key_not_found" });
            return;
        }
        res.json({ ok: true });
    });
    router.post("/enterprise/orgs/:orgId/devices/:deviceId/assign", (req, res) => {
        if (!isAdmin(req)) {
            res.status(401).json({ ok: false, error: "unauthorized_admin_token" });
            return;
        }
        const orgId = String(req.params.orgId);
        const deviceId = String(req.params.deviceId);
        const data = store_1.db.read();
        if (!data.organizations.some((o) => o.id === orgId)) {
            res.status(404).json({ ok: false, error: "org_not_found" });
            return;
        }
        let found = false;
        store_1.db.mutate((draft) => {
            draft.frames = draft.frames.map((f) => {
                if (f.id !== deviceId)
                    return f;
                found = true;
                return { ...f, orgId };
            });
        });
        if (!found) {
            res.status(404).json({ ok: false, error: "device_not_found" });
            return;
        }
        res.json({ ok: true, orgId, deviceId });
    });
    router.get("/enterprise/orgs/:orgId/devices", (req, res) => {
        const orgId = String(req.params.orgId);
        const access = ensureOrgAccess(req, orgId, "devices:read");
        if (!access.ok) {
            res.status(access.status).json(access.body);
            return;
        }
        const data = store_1.db.read();
        const devices = data.frames.filter((f) => f.orgId === orgId);
        res.json({ ok: true, orgId, devices });
    });
    router.get("/enterprise/orgs/:orgId/uploads", (req, res) => {
        const orgId = String(req.params.orgId);
        const access = ensureOrgAccess(req, orgId, "images:read");
        if (!access.ok) {
            res.status(access.status).json(access.body);
            return;
        }
        const data = store_1.db.read();
        const ids = new Set(data.frames.filter((f) => f.orgId === orgId).map((f) => f.id));
        const uploads = data.uploads.filter((u) => ids.has(u.deviceId)).slice(0, 500);
        res.json({ ok: true, orgId, uploads });
    });
    router.post("/enterprise/orgs/:orgId/images/upload", upload.single("file"), (req, res) => {
        const orgId = String(req.params.orgId);
        const access = ensureOrgAccess(req, orgId, "images:write");
        if (!access.ok) {
            res.status(access.status).json(access.body);
            return;
        }
        const file = req.file;
        if (!file) {
            res.status(400).json({ ok: false, error: "missing_file" });
            return;
        }
        const deviceIds = parseDeviceIds(req.body?.device_ids ?? req.body?.deviceId ?? req.body?.deviceIds);
        if (deviceIds.length === 0) {
            res.status(400).json({ ok: false, error: "device_ids_required" });
            return;
        }
        const data = store_1.db.read();
        const orgDeviceSet = new Set(data.frames.filter((f) => f.orgId === orgId).map((f) => f.id));
        const accepted = deviceIds.filter((id) => orgDeviceSet.has(id));
        const rejected = deviceIds.filter((id) => !orgDeviceSet.has(id));
        if (accepted.length === 0) {
            res.status(403).json({ ok: false, error: "no_authorized_devices", rejected });
            return;
        }
        const bytes = fs_1.default.readFileSync(file.path);
        const checksum = crypto_1.default.createHash("sha256").update(bytes).digest("hex");
        const now = Date.now();
        store_1.db.mutate((draft) => {
            for (const deviceId of accepted) {
                draft.uploads.unshift({
                    id: `${now}-${Math.random().toString(16).slice(2, 8)}`,
                    filename: path_1.default.basename(file.path),
                    bytes: file.size,
                    deviceId,
                    atMs: now,
                    checksumSha256: checksum,
                    deliveredToFrame: false,
                    deliveryMode: "enterprise_queued",
                    deliveryCheckedAtMs: now,
                });
            }
            draft.auditLog.unshift({
                id: `audit_${now}`,
                actor: access.actor === "admin" ? "superadmin" : `api_key:${access.principal.keyId}`,
                action: "enterprise_upload_queued",
                target: orgId,
                atMs: now,
                meta: { acceptedCount: accepted.length, rejectedCount: rejected.length, filename: path_1.default.basename(file.path) },
            });
        });
        // Notify frame subscribers
        for (const deviceId of accepted) {
            (0, firebase_admin_1.sendPushToFrameSubscribers)(deviceId, "New Photo from Guest", "A guest has shared a photo to your frame.");
        }
        res.status(202).json({
            ok: true,
            orgId,
            filename: path_1.default.basename(file.path),
            checksum_sha256: checksum,
            image_url: `${mediaBase}/frame-media/${encodeURIComponent(path_1.default.basename(file.path))}`,
            accepted_device_ids: accepted,
            rejected_device_ids: rejected,
            queued_count: accepted.length,
        });
    });
    router.get("/enterprise/self/profile", (req, res) => {
        const u = (0, app_user_jwt_1.verifyUserJwtBearer)(req);
        if (!u) {
            res.status(401).json({ ok: false, error: "unauthorized" });
            return;
        }
        const data = store_1.db.read();
        const user = data.users.find((x) => x.id === u.userId);
        const orgId = user?.orgId ?? data.organizations[0]?.id ?? "org_default";
        const org = data.organizations.find((o) => o.id === orgId) ?? null;
        const apiBase = process.env.PUBLIC_BASE_URL?.trim() || "http://127.0.0.1:3001";
        res.json({
            ok: true,
            orgId,
            organization: org,
            apiBase,
            docs: {
                upload: `${apiBase}/api/enterprise/orgs/${orgId}/images/upload`,
                devices: `${apiBase}/api/enterprise/orgs/${orgId}/devices`,
                uploads: `${apiBase}/api/enterprise/orgs/${orgId}/uploads`,
            },
        });
    });
    router.post("/enterprise/self/api-key", (req, res) => {
        const u = (0, app_user_jwt_1.verifyUserJwtBearer)(req);
        if (!u) {
            res.status(401).json({ ok: false, error: "unauthorized" });
            return;
        }
        const data = store_1.db.read();
        const user = data.users.find((x) => x.id === u.userId);
        const orgId = user?.orgId ?? data.organizations[0]?.id ?? "org_default";
        const name = String(req.body?.name ?? "Web Key").trim();
        const requestedScopes = Array.isArray(req.body?.scopes) ? req.body.scopes.map((s) => String(s)) : [];
        const allowedScopes = ["devices:read", "images:write", "images:read", "commands:write"];
        const scopes = (requestedScopes.length ? requestedScopes : ["devices:read", "images:write"]).filter((s) => allowedScopes.includes(s));
        if (scopes.length === 0) {
            res.status(400).json({ ok: false, error: "invalid_scopes" });
            return;
        }
        const key = (0, enterprise_api_keys_1.generateEnterpriseApiKey)();
        const now = Date.now();
        store_1.db.mutate((draft) => {
            draft.enterpriseApiKeys.push({
                id: key.keyId,
                orgId,
                name: name || "Web Key",
                keyPrefix: key.token.slice(0, 12),
                secretHash: (0, enterprise_api_keys_1.hashApiSecret)(key.keySecret),
                createdAtMs: now,
                lastUsedAtMs: null,
                expiresAtMs: null,
                revokedAtMs: null,
                scopes,
            });
            draft.auditLog.unshift({
                id: `audit_${now}`,
                actor: `user:${u.userId}`,
                action: "enterprise_api_key_created",
                target: orgId,
                atMs: now,
                meta: { keyId: key.keyId, scopes },
            });
        });
        res.status(201).json({
            ok: true,
            apiKey: { id: key.keyId, orgId, name: name || "Web Key", scopes, createdAtMs: now },
            token: key.token,
            note: "Store this token now. It will not be returned again.",
        });
    });
    return router;
}
