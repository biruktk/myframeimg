import crypto from "crypto";
import express, { Request, Response, Router } from "express";

import type { MyframeDb } from "../db/store";
import { db } from "../db/store";
import { requireWechatMiniSecret } from "../middleware/security";
import QRCode from "qrcode";
import { verifyUserJwtBearer } from "../services/app_user_jwt";

export const frameInviteRouter = Router();

frameInviteRouter.use(express.json({ limit: "64kb" }));

export type FrameGuestInviteRow = {
  code: string;
  deviceId: string;
  ownerUserId: string;
  createdAtMs: number;
};

function inviteAlphabetCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) {
    s += alphabet[bytes[i]! % alphabet.length];
  }
  return s;
}

function normalizeDeviceId(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function publicInviteBaseUrl(): string {
  const fromEnv = String(process.env.PUBLIC_INVITE_BASE_URL ?? process.env.PUBLIC_SITE_URL ?? "").trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const api = String(process.env.PUBLIC_BASE_URL ?? "").trim();
  if (api && api.includes("myframe.ink")) return "https://myframe.ink";
  return "https://myframe.ink";
}

function userCanManageDevice(data: MyframeDb, userId: string, deviceId: string): boolean {
  const frame = data.frames.find((f) => f.id === deviceId || normalizeDeviceId(f.bleMac) === deviceId);
  if (frame?.ownerUserId === userId) return true;
  const u = data.users.find((x) => x.id === userId);
  if (!u?.familyGroupId) return false;
  const group = data.familyGroups.find((g) => g.id === u.familyGroupId);
  return Boolean(group?.frameIds.includes(deviceId));
}

function authOwner(req: Request, res: Response): { userId: string } | null {
  const u = verifyUserJwtBearer(req);
  if (u) return { userId: u.userId };
  res.status(401).json({ ok: false, error: "unauthorized", message: "Missing or invalid token" });
  return null;
}

function ensureUniqueCode(draft: MyframeDb, deviceId: string, ownerUserId: string): string {
  if (!Array.isArray(draft.frameGuestInvites)) draft.frameGuestInvites = [];
  const existing = draft.frameGuestInvites.find(
    (r) => r.deviceId === deviceId && r.ownerUserId === ownerUserId,
  );
  if (existing) return existing.code;
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


function normalizeFrameMacParam(raw: string): string {
  let id = normalizeDeviceId(raw);
  if (id.startsWith("MY")) id = id.slice(2);
  if (id.startsWith("IJ")) id = id.slice(2);
  const m = id.match(/([A-F0-9]{12})$/);
  if (m) return m[1]!;
  return id;
}

function buildInviteJson(deviceId: string, inviteCode: string) {
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

function resolveOwnerForFrame(data: MyframeDb, deviceId: string, jwtUserId: string | null): string {
  if (jwtUserId) return jwtUserId;
  const frame = data.frames.find(
    (f) => f.id === deviceId || normalizeDeviceId(f.bleMac) === deviceId || f.id.includes(deviceId),
  );
  if (frame?.ownerUserId) return frame.ownerUserId;
  return `frame:${deviceId}`;
}

/** GET /api/invite/generate?frameMac= — WeChat mini program invite (no admin token). */
function handleGenerateInviteGet(req: Request, res: Response) {
  const rawMac = String(req.query.frameMac ?? req.query.mac ?? req.query.deviceId ?? "").trim();
  const deviceId = normalizeFrameMacParam(rawMac);
  if (deviceId.length < 6 || deviceId.length > 32) {
    res.status(400).json({ ok: false, error: "invalid_frame_mac" });
    return;
  }

  const jwt = verifyUserJwtBearer(req);
  const data = db.read();
  const ownerUserId = resolveOwnerForFrame(data, deviceId, jwt?.userId ?? null);

  db.mutate((draft) => {
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
  db.mutate((draft) => {
    inviteCode = ensureUniqueCode(draft, deviceId, ownerUserId);
  });

  res.json(buildInviteJson(deviceId, inviteCode));
}

/** POST /api/frame/invite — create or reuse guest photo invite for a frame (mini program + app). */
function handleCreateInvite(req: Request, res: Response) {
  const auth = authOwner(req, res);
  if (!auth) return;

  const deviceId = normalizeDeviceId(String(req.body?.deviceId ?? req.body?.mac ?? req.body?.id ?? ""));
  if (deviceId.length < 6 || deviceId.length > 32) {
    res.status(400).json({ ok: false, error: "invalid_device_id" });
    return;
  }

  const data = db.read();
  if (!userCanManageDevice(data, auth.userId, deviceId)) {
    db.mutate((draft) => {
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
      } else {
        frame.ownerUserId = auth.userId;
      }
    });
  }

  let inviteCode = "";
  db.mutate((draft) => {
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

frameInviteRouter.get("/invite/generate", handleGenerateInviteGet);

frameInviteRouter.post("/frame/invite", handleCreateInvite);

/** Optional server-to-server alias for the mini program backend. */
frameInviteRouter.post("/frame/invite/create", requireWechatMiniSecret, (req, res) => {
  const ownerUserId = String(req.body?.ownerUserId ?? req.body?.userId ?? "mini_program").trim();
  const deviceId = normalizeDeviceId(String(req.body?.deviceId ?? req.body?.mac ?? ""));
  if (deviceId.length < 6) {
    res.status(400).json({ ok: false, error: "invalid_device_id" });
    return;
  }
  let inviteCode = "";
  db.mutate((draft) => {
    inviteCode = ensureUniqueCode(draft, deviceId, ownerUserId);
  });
  const inviteUrl = `${publicInviteBaseUrl()}/invite/${inviteCode}`;
  res.json({ ok: true, inviteCode, inviteUrl, url: inviteUrl, deviceId, fromServer: true });
});

/** GET /api/frame/invite/:code — resolve invite (guest upload / web). */
frameInviteRouter.get("/frame/invite/:code", (req, res) => {
  const code = String(req.params.code ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
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
    inviteCode: code,
    inviteUrl,
    url: inviteUrl,
    deviceId: row.deviceId,
    fromServer: true,
  });
});

function normalizeInvitePathCode(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** GET /api/invite/:code/info — guest send screen (WeChat mini program). */
frameInviteRouter.get("/invite/:code/info", (req, res) => {
  const code = normalizeInvitePathCode(String(req.params.code ?? ""));
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

/** GET /api/invite/:code/qr — PNG QR (Share QR Code). */
frameInviteRouter.get("/invite/:code/qr", async (req, res) => {
  try {
    const code = normalizeInvitePathCode(String(req.params.code ?? ""));
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
    const png = await QRCode.toBuffer(inviteUrl, { type: "png", width: 480, margin: 2, errorCorrectionLevel: "M" });
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.send(png);
  } catch (e) {
    console.error("[invite-qr]", e);
    res.status(500).json({ ok: false, error: "qr_generate_failed" });
  }
});

