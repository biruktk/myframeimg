import { Router } from "express";
import QRCode from "qrcode";

import { db } from "../db/store";
import { verifyUserJwtBearer, type AuthedUser } from "../services/app_user_jwt";
import { createOrFetchInvite, publicInviteBaseUrl } from "../services/frame_guest_invite";
import { findFrameByMac, frameDisplayName } from "../services/account_sync_state";
import { grantRemoteMember, getFrameUserRole } from "../services/frame_user_roles";

function inviteFrameDisplayName(deviceId: string): string {
  const data = db.read();
  const frame = findFrameByMac(data, deviceId) || data.frames.find((f) => f.id === deviceId);
  if (!frame) return "";
  return frameDisplayName(frame);
}

function authUser(req: import("express").Request, res: import("express").Response): AuthedUser | null {
  const u = verifyUserJwtBearer(req);
  if (!u) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return null;
  }
  return u;
}

export function frameInviteRouter() {
  const router = Router();

  /** POST /api/frame/invite — create or fetch existing invite (requires auth). */
  router.post("/frame/invite", (req, res) => {
    const auth = authUser(req, res);
    if (!auth) return;
    const deviceId = String(req.body?.deviceId ?? "").trim();
    if (!deviceId) {
      res.status(400).json({ ok: false, error: "missing_device_id" });
      return;
    }
    const result = createOrFetchInvite(deviceId, auth.userId);
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
    const authed = verifyUserJwtBearer(req);
    const ownerUserId = authed?.userId ?? undefined;
    const result = createOrFetchInvite(deviceId, ownerUserId);
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
    const row = db.read().frameGuestInvites?.find((r) => r.code === code);
    if (!row) {
      res.status(404).json({ ok: false, error: "invite_not_found" });
      return;
    }
    const inviteUrl = `${publicInviteBaseUrl()}/invite/${code}`;
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
    if (!auth) return;
    const code = String(req.params.code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 8) {
      res.status(400).json({ ok: false, error: "invalid_invite_code" });
      return;
    }
    const data = db.read();
    const invite = data.frameGuestInvites?.find((r) => r.code === code);
    if (!invite) {
      res.status(404).json({ ok: false, error: "invite_not_found" });
      return;
    }
    const frame =
      findFrameByMac(data, invite.deviceId) || data.frames.find((f) => f.id === invite.deviceId);
    if (!frame) {
      res.status(404).json({ ok: false, error: "frame_not_found" });
      return;
    }
    const permanentName = frameDisplayName(frame);
    const already = !!getFrameUserRole(data, frame.id, auth.userId) ||
      (frame.sharedToUserIds || []).includes(auth.userId);
    if (already) {
      res.json({
        ok: true,
        success: true,
        frameMac: frame.bleMac || frame.id,
        frameName: permanentName,
        alreadyBound: true,
        userRole: getFrameUserRole(data, frame.id, auth.userId) || "MEMBER",
      });
      return;
    }
    // Remote invite link → MEMBER only (never OWNER / never steal co-owners).
    db.mutate((draft) => {
      const live =
        findFrameByMac(draft, invite.deviceId) ||
        draft.frames.find((f) => f.id === invite.deviceId);
      if (!live) return;
      grantRemoteMember(draft, live, auth.userId);
    });
    const after = db.read();
    res.json({
      ok: true,
      success: true,
      frameMac: frame.bleMac || frame.id,
      frameName: permanentName,
      alreadyBound: false,
      userRole: getFrameUserRole(after, frame.id, auth.userId) || "MEMBER",
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
      const row = db.read().frameGuestInvites?.find((r) => r.code === code);
      if (!row) {
        res.status(404).json({ ok: false, error: "invite_not_found" });
        return;
      }
      const inviteUrl = `${publicInviteBaseUrl()}/invite/${code}`;
      const png = await QRCode.toBuffer(inviteUrl, {
        type: "png",
        width: 480,
        margin: 2,
        errorCorrectionLevel: "M",
      });
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.send(png);
    } catch (e) {
      console.error("[invite-qr]", e);
      res.status(500).json({ ok: false, error: "qr_generate_failed" });
    }
  });

  return router;
}
