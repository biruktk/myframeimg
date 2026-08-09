"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.frameInviteRouter = frameInviteRouter;
const express_1 = require("express");
const qrcode_1 = __importDefault(require("qrcode"));
const store_1 = require("../db/store");
const app_user_jwt_1 = require("../services/app_user_jwt");
const frame_guest_invite_1 = require("../services/frame_guest_invite");
const account_sync_state_1 = require("../services/account_sync_state");
function inviteFrameDisplayName(deviceId) {
    const data = store_1.db.read();
    const frame = (0, account_sync_state_1.findFrameByMac)(data, deviceId) || data.frames.find((f) => f.id === deviceId);
    if (!frame)
        return "";
    return (0, account_sync_state_1.frameDisplayName)(frame);
}
function authUser(req, res) {
    const u = (0, app_user_jwt_1.verifyUserJwtBearer)(req);
    if (!u) {
        res.status(401).json({ ok: false, error: "unauthorized" });
        return null;
    }
    return u;
}
function frameInviteRouter() {
    const router = (0, express_1.Router)();
    /** POST /api/frame/invite — create or fetch existing invite (requires auth). */
    router.post("/frame/invite", (req, res) => {
        const auth = authUser(req, res);
        if (!auth)
            return;
        const deviceId = String(req.body?.deviceId ?? "").trim();
        if (!deviceId) {
            res.status(400).json({ ok: false, error: "missing_device_id" });
            return;
        }
        const result = (0, frame_guest_invite_1.createOrFetchInvite)(deviceId, auth.userId);
        res.json({
            ok: true,
            success: true,
            inviteCode: result.code,
            code: result.code,
            inviteUrl: result.url,
            url: result.url,
            link: result.url,
        });
    });
    /** GET /api/invite/generate — create or fetch existing invite (query-based, optional auth). */
    router.get("/invite/generate", (req, res) => {
        const deviceId = String(req.query.frameMac ?? req.query.deviceId ?? "").trim();
        if (!deviceId) {
            res.status(400).json({ ok: false, error: "missing_frameMac" });
            return;
        }
        const authed = (0, app_user_jwt_1.verifyUserJwtBearer)(req);
        const ownerUserId = authed?.userId ?? undefined;
        const result = (0, frame_guest_invite_1.createOrFetchInvite)(deviceId, ownerUserId);
        res.json({
            ok: true,
            success: true,
            inviteCode: result.code,
            code: result.code,
            inviteUrl: result.url,
            url: result.url,
            link: result.url,
        });
    });
    /** GET /api/invite/:code/info — public guest info for invite page. */
    router.get("/invite/:code/info", (req, res) => {
        const code = String(req.params.code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (code.length !== 8) {
            res.status(400).json({ ok: false, error: "invalid_invite_code" });
            return;
        }
        const row = store_1.db.read().frameGuestInvites?.find((r) => r.code === code);
        if (!row) {
            res.status(404).json({ ok: false, error: "invite_not_found" });
            return;
        }
        const inviteUrl = `${(0, frame_guest_invite_1.publicInviteBaseUrl)()}/invite/${code}`;
        const permanentName = inviteFrameDisplayName(row.deviceId);
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
            // Owner's permanent display name — never MY_<mac> / frame id.
            frameName: permanentName || "",
            frameOwnerName: permanentName || "",
            fromServer: true,
        });
    });
    /** POST /api/invite/:code/bind-account — guest binds frame to their account after invite. */
    router.post("/invite/:code/bind-account", (req, res) => {
        const auth = authUser(req, res);
        if (!auth)
            return;
        const code = String(req.params.code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (code.length !== 8) {
            res.status(400).json({ ok: false, error: "invalid_invite_code" });
            return;
        }
        const data = store_1.db.read();
        const invite = data.frameGuestInvites?.find((r) => r.code === code);
        if (!invite) {
            res.status(404).json({ ok: false, error: "invite_not_found" });
            return;
        }
        const frame = (0, account_sync_state_1.findFrameByMac)(data, invite.deviceId) || data.frames.find((f) => f.id === invite.deviceId);
        if (!frame) {
            res.status(404).json({ ok: false, error: "frame_not_found" });
            return;
        }
        const permanentName = (0, account_sync_state_1.frameDisplayName)(frame);
        if (frame.sharedToUserIds.includes(auth.userId)) {
            res.json({
                ok: true,
                success: true,
                frameMac: frame.bleMac || frame.id,
                frameName: permanentName,
                alreadyBound: true,
            });
            return;
        }
        frame.sharedToUserIds.push(auth.userId);
        store_1.db.write(data);
        res.json({
            ok: true,
            success: true,
            frameMac: frame.bleMac || frame.id,
            frameName: permanentName,
            alreadyBound: false,
        });
    });
    /** GET /api/invite/:code/qr — PNG QR code for invite. */
    router.get("/invite/:code/qr", async (req, res) => {
        try {
            const code = String(req.params.code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
            if (code.length !== 8) {
                res.status(400).json({ ok: false, error: "invalid_invite_code" });
                return;
            }
            const row = store_1.db.read().frameGuestInvites?.find((r) => r.code === code);
            if (!row) {
                res.status(404).json({ ok: false, error: "invite_not_found" });
                return;
            }
            const inviteUrl = `${(0, frame_guest_invite_1.publicInviteBaseUrl)()}/invite/${code}`;
            const png = await qrcode_1.default.toBuffer(inviteUrl, {
                type: "png",
                width: 480,
                margin: 2,
                errorCorrectionLevel: "M",
            });
            res.setHeader("Content-Type", "image/png");
            res.setHeader("Cache-Control", "public, max-age=300");
            res.send(png);
        }
        catch (e) {
            console.error("[invite-qr]", e);
            res.status(500).json({ ok: false, error: "qr_generate_failed" });
        }
    });
    return router;
}
