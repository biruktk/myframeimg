import { Router } from "express";
import QRCode from "qrcode";

import { db } from "../db/store";
import { verifyUserJwtBearer, type AuthedUser } from "../services/app_user_jwt";
import { createOrFetchInvite, publicInviteBaseUrl } from "../services/frame_guest_invite";

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
