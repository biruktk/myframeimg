import crypto from "crypto";
import express, { Request, Response, Router } from "express";
import { db } from "../db/store";
import type { AuthedUser } from "../services/app_user_jwt";
import { verifyUserJwtBearer } from "../services/app_user_jwt";

export const userPortalRouter = Router();
userPortalRouter.use(express.json({ limit: "256kb" }));

function authUser(req: Request, res: Response): AuthedUser | null {
  const u = verifyUserJwtBearer(req);
  if (!u) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return null;
  }
  return u;
}

function normalizeBleKey(bleMac: string): string {
  return bleMac.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
}

function visibleFrameIdsForUser(userId: string): string[] {
  const data = db.read();
  const user = data.users.find((x) => x.id === userId);
  const ids = new Set<string>();
  for (const f of data.frames) {
    if (f.ownerUserId === userId) ids.add(f.id);
  }
  if (user?.familyGroupId) {
    const g = data.familyGroups.find((fg) => fg.id === user.familyGroupId);
    if (g) {
      for (const fid of g.frameIds) ids.add(fid);
    }
  }
  return [...ids];
}

function playlistEditableByUser(plId: string, userId: string): boolean {
  const data = db.read();
  const vis = new Set(visibleFrameIdsForUser(userId));
  const pl = data.playlists.find((p) => p.id === plId);
  if (!pl || pl.system) return false;
  return pl.assignedFrameIds.some((fid) => vis.has(fid));
}

/** GET /api/user/dashboard */
userPortalRouter.get("/user/dashboard", (req: Request, res: Response) => {
  const auth = authUser(req, res);
  if (!auth) return;

  const data = db.read();
  const user = data.users.find((u) => u.id === auth.userId);
  if (!user) {
    res.status(404).json({ ok: false, error: "user_not_found" });
    return;
  }
  const frameIds = visibleFrameIdsForUser(auth.userId);
  const frames = data.frames.filter((f) => frameIds.includes(f.id));
  const now = Date.now();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const msStart = monthStart.getTime();

  const uploadsOnFrames = data.uploads
    .filter((u) => frameIds.includes(u.deviceId))
    .sort((a, b) => b.atMs - a.atMs);
  const photosThisMonth = uploadsOnFrames.filter((u) => u.atMs >= msStart).length;

  const lastPhotoAtMsByFrame = new Map<string, number>();
  for (const u of uploadsOnFrames) {
    if (!lastPhotoAtMsByFrame.has(u.deviceId)) lastPhotoAtMsByFrame.set(u.deviceId, u.atMs);
  }

  let onlineDevices = 0;
  const deviceRows = frames.map((f) => {
    const online =
      f.wifiStatus === "online" ||
      (f.lastSeenAtMs != null && now - f.lastSeenAtMs < 15 * 60 * 1000);
    if (online) onlineDevices += 1;
    const macKey = normalizeBleKey(f.bleMac);
    const slideshow = data.slideshowsByBleMac?.[macKey];
    return {
      id: f.id,
      bleMac: f.bleMac,
      name: f.id,
      wifiStatus: f.wifiStatus,
      online,
      lastSeenAtMs: f.lastSeenAtMs,
      lastPhotoAtMs: lastPhotoAtMsByFrame.get(f.id) ?? null,
      firmwareVersion: f.firmwareVersion,
      slideshowIntervalMinutes: slideshow?.intervalMinutes ?? data.settings.preferences.autoRotateMinutes ?? 10,
      slideshowImageCount: slideshow?.imageIds?.length ?? 0,
      batteryPct: null as number | null,
    };
  });

  const aiSeen = new Set<string>();
  for (const e of data.auditLog) {
    const aiish = /ai/i.test(String(e.action));
    if (!aiish && !/ai_generated/i.test(String(e.action))) continue;
    if (e.actor !== user.email && e.actor !== user.id && !String(e.target).includes(user.id)) continue;
    aiSeen.add(e.id);
  }
  const aiGen = aiSeen.size;

  const familyGroup = user.familyGroupId
    ? data.familyGroups.find((g) => g.id === user.familyGroupId)
    : null;
  const memberRows =
    familyGroup?.members.map((m) => {
      const mu = data.users.find((x) => x.id === m.userId);
      const roleLabel =
        m.role === "owner" ? "Owner" : String(m.role).toLowerCase() === "admin" ? "Admin" : "Member";
      return {
        userId: m.userId,
        name: mu?.name ?? m.userId,
        email: mu?.email ?? "",
        role: roleLabel,
        isSelf: m.userId === user.id,
      };
    }) ?? [];

  const recentPhotos = uploadsOnFrames.slice(0, 24).map((u) => ({
    id: u.id,
    filename: u.filename,
    atMs: u.atMs,
    deviceId: u.deviceId,
    thumbUrl: `/frame-media/${encodeURIComponent(u.filename)}`,
  }));

  const aiPhotos = uploadsOnFrames
    .filter((u) => String(u.deliveryMode ?? "").toLowerCase().includes("ai"))
    .slice(0, 12)
    .map((u) => ({
      id: u.id,
      filename: u.filename,
      thumbUrl: `/frame-media/${encodeURIComponent(u.filename)}`,
    }));

  const activity: Array<{ id: string; kind: string; label: string; atMs: number }> = [];
  for (const u of uploadsOnFrames.slice(0, 12)) {
    activity.push({
      id: `up_${u.id}`,
      kind: "photo",
      label: `Photo sent to ${u.deviceId}`,
      atMs: u.atMs,
    });
  }
  for (const e of data.auditLog) {
    const rel =
      e.actor === user.email ||
      e.actor === user.id ||
      e.target === user.id ||
      frameIds.some((fid) => e.target.includes(fid));
    if (!rel) continue;
    activity.push({
      id: e.id,
      kind: String(e.action),
      label: `${e.action}: ${e.target}`,
      atMs: e.atMs,
    });
  }
  activity.sort((a, b) => b.atMs - a.atMs);

  const playlists = data.playlists.filter((p) => p.assignedFrameIds.some((fid) => frameIds.includes(fid)));

  res.json({
    ok: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      subscriptionTier: user.subscriptionTier,
      roleLabel: familyGroup?.members.find((m) => m.userId === user.id)?.role === "owner" ? "Owner" : "Member",
    },
    stats: {
      activeDevices: frames.length,
      onlineDevices,
      familyMembers: memberRows.length || 1,
      photosThisMonth,
      aiGenerated: aiGen,
    },
    devices: deviceRows,
    recentPhotos,
    aiPhotos,
    familyMembers: memberRows,
    activity: activity.slice(0, 25),
    playlists: playlists.map((p) => ({
      id: p.id,
      title: p.title,
      photoIds: p.photoIds,
      scheduleRule: p.scheduleRule,
      assignedFrameIds: p.assignedFrameIds,
      system: p.system,
    })),
    integrations: data.settings.integrations,
    preferences: data.settings.preferences,
    account: data.settings.account,
    familyInviteCode: familyGroup?.inviteCode ?? null,
  });
});

/** POST /api/user/devices — link or register a frame to the signed-in user. */
userPortalRouter.post("/user/devices", (req: Request, res: Response) => {
  const auth = authUser(req, res);
  if (!auth) return;

  const deviceId = String(req.body?.deviceId ?? req.body?.id ?? "").trim();
  const bleMacRaw = String(req.body?.bleMac ?? "").trim();
  const displayName = String(req.body?.displayName ?? req.body?.name ?? "").trim();

  if (!deviceId || deviceId.length < 3 || deviceId.length > 64) {
    res.status(400).json({ ok: false, error: "invalid_device_id" });
    return;
  }

  const data = db.read();
  const user = data.users.find((u) => u.id === auth.userId);
  if (!user) {
    res.status(404).json({ ok: false, error: "user_not_found" });
    return;
  }

  const bleMac =
    bleMacRaw.length > 0
      ? bleMacRaw
      : deviceId.replace(/[^a-fA-F0-9]/g, "").length >= 6
        ? deviceId
        : `WEB-${deviceId}`;

  const now = Date.now();
  let familyGroupId = user.familyGroupId;

  db.mutate((draft) => {
    const u = draft.users.find((x) => x.id === auth.userId);
    if (!u) return;

    let frame = draft.frames.find((f) => f.id === deviceId);
    if (!frame) {
      frame = {
        id: deviceId,
        bleMac,
        ownerUserId: auth.userId,
        orgId: u.orgId,
        wifiSsid: null,
        wifiStatus: "never_provisioned",
        firmwareVersion: "1.0.0",
        lastSeenAtMs: null,
        uptimeMs: 0,
        photoQueueDepth: 0,
        ota: { targetVersion: null, status: "idle" },
      };
      draft.frames.push(frame);
    } else {
      frame.ownerUserId = auth.userId;
      if (bleMacRaw.length > 0) frame.bleMac = bleMac;
    }

    let group = familyGroupId ? draft.familyGroups.find((g) => g.id === familyGroupId) : undefined;
    if (!group) {
      familyGroupId = `fam_${now}_${crypto.randomBytes(2).toString("hex")}`;
      group = {
        id: familyGroupId,
        name: `${u.name}'s Family`,
        inviteCode: `INV-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
        members: [{ userId: auth.userId, role: "owner" }],
        frameIds: [],
      };
      draft.familyGroups.push(group);
      u.familyGroupId = familyGroupId;
    }

    if (!group.frameIds.includes(deviceId)) {
      group.frameIds.push(deviceId);
    }

    if (draft.device.id === deviceId || draft.frames.filter((f) => f.ownerUserId === auth.userId).length === 1) {
      draft.device.id = deviceId;
      draft.device.name = displayName || deviceId;
      draft.device.connected = false;
    }

    draft.auditLog.unshift({
      id: `audit_${now}_${crypto.randomBytes(2).toString("hex")}`,
      actor: `user:${auth.userId}`,
      action: "add_device",
      target: deviceId,
      atMs: now,
      meta: { bleMac },
    });
  });

  res.json({ ok: true, device: { id: deviceId, bleMac, name: displayName || deviceId } });
});

/** POST /api/user/playlists */
userPortalRouter.post("/user/playlists", (req: Request, res: Response) => {
  const auth = authUser(req, res);
  if (!auth) return;

  const title = String(req.body?.title ?? "New playlist").trim() || "New playlist";
  const frameIds = visibleFrameIdsForUser(auth.userId);
  const assignTo = String(req.body?.assignedFrameId ?? "").trim();
  const assignedFrameIds =
    assignTo && frameIds.includes(assignTo) ? [assignTo] : frameIds.length ? [frameIds[0]!] : [];

  if (!assignedFrameIds.length) {
    res.status(400).json({ ok: false, error: "no_device_to_assign" });
    return;
  }

  const id = `pl_${Date.now()}_${crypto.randomBytes(2).toString("hex")}`;
  db.mutate((draft) => {
    draft.playlists.push({
      id,
      title,
      photoIds: [],
      scheduleRule: req.body?.scheduleRule != null ? String(req.body.scheduleRule) : "daily",
      assignedFrameIds,
      system: false,
    });
  });

  const pl = db.read().playlists.find((p) => p.id === id);
  res.status(201).json({ ok: true, playlist: pl });
});

/** PATCH /api/user/playlists/:id */
userPortalRouter.patch("/user/playlists/:id", (req: Request, res: Response) => {
  const auth = authUser(req, res);
  if (!auth) return;
  const id = String(req.params.id);
  if (!playlistEditableByUser(id, auth.userId)) {
    res.status(403).json({ ok: false, error: "playlist_not_editable" });
    return;
  }
  const title = req.body?.title != null ? String(req.body.title).trim() : undefined;
  const scheduleRule = req.body?.scheduleRule !== undefined ? (req.body.scheduleRule === null ? null : String(req.body.scheduleRule)) : undefined;
  const photoIds = Array.isArray(req.body?.photoIds) ? (req.body.photoIds as unknown[]).map((x) => String(x)) : undefined;

  let updated = false;
  const next = db.mutate((draft) => {
    draft.playlists = draft.playlists.map((p) => {
      if (p.id !== id) return p;
      updated = true;
      return {
        ...p,
        ...(title !== undefined && title.length > 0 ? { title } : {}),
        ...(scheduleRule !== undefined ? { scheduleRule } : {}),
        ...(photoIds !== undefined ? { photoIds } : {}),
      };
    });
  });
  if (!updated) {
    res.status(404).json({ ok: false, error: "playlist_not_found" });
    return;
  }
  const pl = next.playlists.find((p) => p.id === id);
  res.json({ ok: true, playlist: pl });
});
