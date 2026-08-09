"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirePairingToken = requirePairingToken;
exports.requireWechatMiniSecret = requireWechatMiniSecret;
exports.requireAdminToken = requireAdminToken;
exports.uploadRateLimit = uploadRateLimit;
exports.inviteCodeFromRequest = inviteCodeFromRequest;
exports.requirePairingTokenOrInvite = requirePairingTokenOrInvite;
const frame_guest_invite_1 = require("../services/frame_guest_invite");
function secureEqual(a, b) {
    if (a.length !== b.length)
        return false;
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}
function readBearerToken(req) {
    const auth = String(req.header("authorization") ?? "");
    if (auth.toLowerCase().startsWith("bearer ")) {
        return auth.slice(7).trim();
    }
    return null;
}
function tokenFromRequest(req) {
    return (readBearerToken(req) ??
        String(req.header("x-pairing-token") ?? req.header("x-admin-token") ?? "")).trim();
}
function pairingTokenFromRequest(req) {
    const explicitPairingToken = String(req.header("x-pairing-token") ?? "").trim();
    if (explicitPairingToken)
        return explicitPairingToken;
    return (readBearerToken(req) ?? String(req.header("x-admin-token") ?? "")).trim();
}
function requirePairingToken(req, res, next) {
    const expected = String(process.env.FRAME_PAIRING_TOKEN ?? "").trim();
    if (!expected) {
        next();
        return;
    }
    const got = pairingTokenFromRequest(req);
    if (!got || !secureEqual(got, expected)) {
        res.status(401).json({ ok: false, error: "unauthorized_pairing_token" });
        return;
    }
    next();
}
/** Separate secret for WeChat Mini Program server → MyFrame API (`x-wechat-mini-secret` or Bearer). */
function requireWechatMiniSecret(req, res, next) {
    const expected = String(process.env.WECHAT_MINI_API_SECRET ?? "").trim();
    if (!expected) {
        res.status(503).json({ ok: false, error: "wechat_mini_secret_not_configured" });
        return;
    }
    const got = (readBearerToken(req) ?? String(req.header("x-wechat-mini-secret") ?? "")).trim();
    if (!got || !secureEqual(got, expected)) {
        res.status(401).json({ ok: false, error: "unauthorized_wechat_mini_secret" });
        return;
    }
    next();
}
function requireAdminToken(req, res, next) {
    const expected = String(process.env.ADMIN_TOKEN ?? "framepass2026").trim();
    if (!expected) {
        res.status(503).json({ ok: false, error: "admin_token_not_configured" });
        return;
    }
    const got = tokenFromRequest(req);
    if (!got || !secureEqual(got, expected)) {
        res.status(401).json({ ok: false, error: "unauthorized_admin_token" });
        return;
    }
    next();
}
const buckets = new Map();
function uploadRateLimit(req, res, next) {
    const maxPerMinute = Number(process.env.UPLOADS_PER_MINUTE ?? 30);
    if (!Number.isFinite(maxPerMinute) || maxPerMinute <= 0) {
        next();
        return;
    }
    const now = Date.now();
    const windowMs = 60000;
    const key = `${req.ip}|upload`;
    const bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAtMs) {
        buckets.set(key, { count: 1, resetAtMs: now + windowMs });
        next();
        return;
    }
    bucket.count += 1;
    if (bucket.count > maxPerMinute) {
        const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAtMs - now) / 1000));
        res.setHeader("retry-after", `${retryAfterSec}`);
        res.status(429).json({ ok: false, error: "upload_rate_limited", retry_after_sec: retryAfterSec });
        return;
    }
    next();
}
function inviteCodeFromRequest(req) {
    const params = req.params;
    return String(params?.code ??
        req.header("x-invite-code") ??
        req.body?.invite_code ??
        req.body?.inviteCode ??
        "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
}
/** Accept global pairing token OR a valid frame guest invite code (mini program / web guests). */
function requirePairingTokenOrInvite(req, res, next) {
    const preset = req.frameInviteDeviceId;
    if (preset) {
        next();
        return;
    }
    const code = inviteCodeFromRequest(req);
    if (code.length === 8) {
        const deviceId = (0, frame_guest_invite_1.lookupFrameInviteDeviceId)(code);
        if (!deviceId) {
            res.status(401).json({ ok: false, error: "invalid_invite_code" });
            return;
        }
        req.frameInviteDeviceId = deviceId;
        next();
        return;
    }
    requirePairingToken(req, res, next);
}
