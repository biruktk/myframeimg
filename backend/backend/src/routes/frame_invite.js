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
exports.frameInviteRouter = void 0;
const crypto_1 = __importDefault(require("crypto"));
const express_1 = __importStar(require("express"));
const store_1 = require("../db/store");
const security_1 = require("../middleware/security");
const qrcode_1 = __importDefault(require("qrcode"));
const app_user_jwt_1 = require("../services/app_user_jwt");
exports.frameInviteRouter = (0, express_1.Router)();
exports.frameInviteRouter.use(express_1.default.json({ limit: "64kb" }));
function inviteAlphabetCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto_1.default.randomBytes(8);
    let s = "";
    for (let i = 0; i < 8; i++) {
        s += alphabet[bytes[i] % alphabet.length];
    }
    return s;
}
function normalizeDeviceId(raw) {
    return String(raw ?? "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
}
function publicInviteBaseUrl() {
    const fromEnv = String(process.env.PUBLIC_INVITE_BASE_URL ?? process.env.PUBLIC_SITE_URL ?? "").trim();
    if (fromEnv)
        return fromEnv.replace(/\/$/, "");
    const api = String(process.env.PUBLIC_BASE_URL ?? "").trim();
    if (api && api.includes("myframe.ink"))
        return "https://myframe.ink";
    return "https://myframe.ink";
}
function userCanManageDevice(data, userId, deviceId) {
    const frame = data.frames.find((f) => f.id === deviceId || normalizeDeviceId(f.bleMac) === deviceId);
    if (frame?.ownerUserId === userId)
        return true;
    const u = data.users.find((x) => x.id === userId);
    if (!u?.familyGroupId)
        return false;
    const group = data.familyGroups.find((g) => g.id === u.familyGroupId);
    return Boolean(group?.frameIds.includes(deviceId));
}
function authOwner(req, res) {
    const u = (0, app_user_jwt_1.verifyUserJwtBearer)(req);
    if (u)
        return { userId: u.userId };
    res.status(401).json({ ok: false, error: "unauthorized", message: "Missing or invalid token" });
    return null;
}
function ensureUniqueCode(draft, deviceId, ownerUserId) {
    if (!Array.isArray(draft.frameGuestInvites))
        draft.frameGuestInvites = [];
    const existing = draft.frameGuestInvites.find((r) => r.deviceId === deviceId && r.ownerUserId === ownerUserId);
    if (existing)
        return existing.code;
    for (let attempt = 0; attempt < 32; attempt++) {
        const code = inviteAlphabetCode();
        if (!draft.frameGuestInvites.some((r) => r.code === code)) {
            draft.frameGuestInvites.push({
                code,
                deviceId,
                ownerUserId,
                createdAtMs: Date.now(),
            });
            return code;
        }
    }
    const code = inviteAlphabetCode();
    draft.frameGuestInvites.push({ code, deviceId, ownerUserId, createdAtMs: Date.now() });
    return code;
}
function normalizeFrameMacParam(raw) {
    let id = normalizeDeviceId(raw);
    if (id.startsWith("MY"))
        id = id.slice(2);
    if (id.startsWith("IJ"))
        id = id.slice(2);
    const m = id.match(/([A-F0-9]{12})$/);
    if (m)
        return m[1];
    return id;
}
function buildInviteJson(deviceId, inviteCode) {
    const inviteUrl = `${publicInviteBaseUrl()}/invite/${inviteCode}`;
    const qrUrl = `${publicInviteBaseUrl().replace(/\/$/, "")}/api/invite/${inviteCode}/qr`;
    return {
        ok: true,
        success: true,
        inviteCode,
        code: inviteCode,
        inviteUrl,
        link: inviteUrl,
        url: inviteUrl,
        qrUrl,
        qrImageUrl: qrUrl,
        shareQrUrl: qrUrl,
        frameMac: deviceId,
        deviceId,
        fromServer: true,
        server: true,
    };
}
function resolveOwnerForFrame(data, deviceId, jwtUserId) {
    if (jwtUserId)
        return jwtUserId;
    const frame = data.frames.find((f) => f.id === deviceId || normalizeDeviceId(f.bleMac) === deviceId || f.id.includes(deviceId));
    if (frame?.ownerUserId)
        return frame.ownerUserId;
    return `frame:${deviceId}`;
}
/** GET /api/invite/generate?frameMac= — WeChat mini program invite (no admin token). */
function handleGenerateInviteGet(req, res) {
    const rawMac = String(req.query.frameMac ?? req.query.mac ?? req.query.deviceId ?? "").trim();
    const deviceId = normalizeFrameMacParam(rawMac);
    if (deviceId.length < 6 || deviceId.length > 32) {
        res.status(400).json({ ok: false, error: "invalid_frame_mac" });
        return;
    }
    const jwt = (0, app_user_jwt_1.verifyUserJwtBearer)(req);
    const data = store_1.db.read();
    const ownerUserId = resolveOwnerForFrame(data, deviceId, jwt?.userId ?? null);
    store_1.db.mutate((draft) => {
        let frame = draft.frames.find((f) => f.id === deviceId || normalizeDeviceId(f.bleMac) === deviceId);
        if (!frame) {
            frame = {
                id: deviceId,
                bleMac: deviceId,
                ownerUserId,
                wifiSsid: null,
                wifiStatus: "never_provisioned",
                firmwareVersion: "unknown",
                lastSeenAtMs: null,
                uptimeMs: 0,
                photoQueueDepth: 0,
                ota: { targetVersion: null, status: "idle" },
            };
            draft.frames.push(frame);
        }
    });
    let inviteCode = "";
    store_1.db.mutate((draft) => {
        inviteCode = ensureUniqueCode(draft, deviceId, ownerUserId);
    });
    res.json(buildInviteJson(deviceId, inviteCode));
}
/** POST /api/frame/invite — create or reuse guest photo invite for a frame (mini program + app). */
function handleCreateInvite(req, res) {
    const auth = authOwner(req, res);
    if (!auth)
        return;
    const deviceId = normalizeDeviceId(String(req.body?.deviceId ?? req.body?.mac ?? req.body?.id ?? ""));
    if (deviceId.length < 6 || deviceId.length > 32) {
        res.status(400).json({ ok: false, error: "invalid_device_id" });
        return;
    }
    const data = store_1.db.read();
    if (!userCanManageDevice(data, auth.userId, deviceId)) {
        store_1.db.mutate((draft) => {
            let frame = draft.frames.find((f) => f.id === deviceId);
            if (!frame) {
                frame = {
                    id: deviceId,
                    bleMac: deviceId,
                    ownerUserId: auth.userId,
                    wifiSsid: null,
                    wifiStatus: "never_provisioned",
                    firmwareVersion: "unknown",
                    lastSeenAtMs: null,
                    uptimeMs: 0,
                    photoQueueDepth: 0,
                    ota: { targetVersion: null, status: "idle" },
                };
                draft.frames.push(frame);
            }
            else {
                frame.ownerUserId = auth.userId;
            }
        });
    }
    let inviteCode = "";
    store_1.db.mutate((draft) => {
        inviteCode = ensureUniqueCode(draft, deviceId, auth.userId);
    });
    const base = publicInviteBaseUrl();
    const inviteUrl = `${base}/invite/${inviteCode}`;
    res.json({
        ok: true,
        inviteCode,
        inviteUrl,
        url: inviteUrl,
        deviceId,
        fromServer: true,
    });
}
exports.frameInviteRouter.get("/invite/generate", handleGenerateInviteGet);
exports.frameInviteRouter.post("/frame/invite", handleCreateInvite);
/** Optional server-to-server alias for the mini program backend. */
exports.frameInviteRouter.post("/frame/invite/create", security_1.requireWechatMiniSecret, (req, res) => {
    const ownerUserId = String(req.body?.ownerUserId ?? req.body?.userId ?? "mini_program").trim();
    const deviceId = normalizeDeviceId(String(req.body?.deviceId ?? req.body?.mac ?? ""));
    if (deviceId.length < 6) {
        res.status(400).json({ ok: false, error: "invalid_device_id" });
        return;
    }
    let inviteCode = "";
    store_1.db.mutate((draft) => {
        inviteCode = ensureUniqueCode(draft, deviceId, ownerUserId);
    });
    const inviteUrl = `${publicInviteBaseUrl()}/invite/${inviteCode}`;
    res.json({ ok: true, inviteCode, inviteUrl, url: inviteUrl, deviceId, fromServer: true });
});
/** GET /api/frame/invite/:code — resolve invite (guest upload / web). */
exports.frameInviteRouter.get("/frame/invite/:code", (req, res) => {
    const code = String(req.params.code ?? "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
    if (code.length !== 8) {
        res.status(400).json({ ok: false, error: "invalid_invite_code" });
        return;
    }
    const row = store_1.db.read().frameGuestInvites?.find((r) => r.code === code);
    if (!row) {
        res.status(404).json({ ok: false, error: "invite_not_found" });
        return;
    }
    const inviteUrl = `${publicInviteBaseUrl()}/invite/${code}`;
    res.json({
        ok: true,
        inviteCode: code,
        inviteUrl,
        url: inviteUrl,
        deviceId: row.deviceId,
        fromServer: true,
    });
});
function normalizeInvitePathCode(raw) {
    return String(raw ?? "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
}
/** GET /api/invite/:code/info — guest send screen (WeChat mini program). */
exports.frameInviteRouter.get("/invite/:code/info", (req, res) => {
    const code = normalizeInvitePathCode(String(req.params.code ?? ""));
    if (code.length !== 8) {
        res.status(400).json({ ok: false, error: "invalid_invite_code" });
        return;
    }
    const row = store_1.db.read().frameGuestInvites?.find((r) => r.code === code);
    if (!row) {
        res.status(404).json({ ok: false, error: "invite_not_found" });
        return;
    }
    const inviteUrl = `${publicInviteBaseUrl()}/invite/${code}`;
    res.json({
        ok: true,
        success: true,
        inviteCode: code,
        code,
        inviteUrl,
        link: inviteUrl,
        url: inviteUrl,
        frameMac: row.deviceId,
        deviceId: row.deviceId,
        frameName: `MY_${row.deviceId}`,
        fromServer: true,
    });
});
/** GET /api/invite/:code/qr — PNG QR (Share QR Code). */
exports.frameInviteRouter.get("/invite/:code/qr", async (req, res) => {
    try {
        const code = normalizeInvitePathCode(String(req.params.code ?? ""));
        if (code.length !== 8) {
            res.status(400).json({ ok: false, error: "invalid_invite_code" });
            return;
        }
        const row = store_1.db.read().frameGuestInvites?.find((r) => r.code === code);
        if (!row) {
            res.status(404).json({ ok: false, error: "invite_not_found" });
            return;
        }
        const inviteUrl = `${publicInviteBaseUrl()}/invite/${code}`;
        const png = await qrcode_1.default.toBuffer(inviteUrl, { type: "png", width: 480, margin: 2, errorCorrectionLevel: "M" });
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Cache-Control", "public, max-age=300");
        res.send(png);
    }
    catch (e) {
        console.error("[invite-qr]", e);
        res.status(500).json({ ok: false, error: "qr_generate_failed" });
    }
});
