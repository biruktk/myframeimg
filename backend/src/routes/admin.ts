import { Router } from "express";
import { db } from "../db/store";
import { requireAdminToken } from "../middleware/security";

export const adminRouter = Router();
adminRouter.use(requireAdminToken);

function serialFromDeviceId(id: string): string {
  const m = id.match(/(\d+)(?!.*\d)/);
  return m ? m[1] : "--";
}

adminRouter.get("/admin/overview", (_req, res) => {
  const data = db.read();
  res.json({
    totalUploads: data.uploads.length,
    totalFaqs: data.faqs.length,
    photoCount: data.device.photoCount,
    lastPhotoAtMs: data.device.lastPhotoAtMs,
    connected: data.device.connected,
    deviceId: data.device.id,
    deviceSn: serialFromDeviceId(data.device.id),
    usedBytes: data.device.usedBytes,
    capacityBytes: data.device.capacityBytes,
  });
});

adminRouter.get("/admin/faqs", (_req, res) => {
  const data = db.read();
  res.json(data.faqs);
});

adminRouter.post("/admin/faqs", (req, res) => {
  const q = String(req.body?.question ?? "").trim();
  const a = String(req.body?.answer ?? "").trim();
  if (!q || !a) {
    res.status(400).json({ ok: false, error: "question_and_answer_required" });
    return;
  }
  const now = Date.now();
  const id = `faq_${now}_${Math.random().toString(16).slice(2, 8)}`;
  const next = db.mutate((draft) => {
    draft.faqs.unshift({ id, question: q, answer: a, updatedAtMs: now });
  });
  res.status(201).json(next.faqs[0]);
});

adminRouter.put("/admin/faqs/:id", (req, res) => {
  const id = String(req.params.id);
  const q = String(req.body?.question ?? "").trim();
  const a = String(req.body?.answer ?? "").trim();
  if (!q || !a) {
    res.status(400).json({ ok: false, error: "question_and_answer_required" });
    return;
  }
  let updated = false;
  const now = Date.now();
  const next = db.mutate((draft) => {
    draft.faqs = draft.faqs.map((f) => {
      if (f.id !== id) return f;
      updated = true;
      return { ...f, question: q, answer: a, updatedAtMs: now };
    });
  });
  if (!updated) {
    res.status(404).json({ ok: false, error: "faq_not_found" });
    return;
  }
  res.json(next.faqs.find((f) => f.id === id));
});

adminRouter.delete("/admin/faqs/:id", (req, res) => {
  const id = String(req.params.id);
  let deleted = false;
  db.mutate((draft) => {
    const before = draft.faqs.length;
    draft.faqs = draft.faqs.filter((f) => f.id !== id);
    deleted = draft.faqs.length < before;
  });
  if (!deleted) {
    res.status(404).json({ ok: false, error: "faq_not_found" });
    return;
  }
  res.json({ ok: true });
});

// Superadmin: Fleet overview
adminRouter.get("/admin/fleet/overview", (_req, res) => {
  const data = db.read();
  const frames = data.frames;
  const now = Date.now();
  const online = frames.filter((f) => f.wifiStatus === "online").length;
  const offline = frames.filter((f) => f.wifiStatus === "offline").length;
  const neverProvisioned = frames.filter((f) => f.wifiStatus === "never_provisioned").length;
  const activeToday = frames.filter((f) => f.lastSeenAtMs && now - f.lastSeenAtMs < 24 * 60 * 60 * 1000).length;
  const firmwareDistribution = frames.reduce<Record<string, number>>((acc, f) => {
    acc[f.firmwareVersion] = (acc[f.firmwareVersion] ?? 0) + 1;
    return acc;
  }, {});
  res.json({
    totalFrames: frames.length,
    onlineNow: online,
    offline,
    neverProvisioned,
    dailyActiveFrames: activeToday,
    firmwareDistribution,
    locations: frames.filter((f) => f.location).map((f) => ({ id: f.id, ...(f.location as { lat: number; lng: number }) })),
  });
});

// Superadmin: User management
adminRouter.get("/admin/users", (req, res) => {
  const q = String(req.query.q ?? "").trim().toLowerCase();
  const data = db.read();
  const out = data.users
    .filter((u) => {
      if (!q) return true;
      const frames = data.frames.filter((f) => f.ownerUserId === u.id);
      return (
        u.email.toLowerCase().includes(q) ||
        u.id.toLowerCase().includes(q) ||
        frames.some((f) => f.id.toLowerCase().includes(q) || f.bleMac.toLowerCase().includes(q))
      );
    })
    .map((u) => ({
      ...u,
      frames: data.frames.filter((f) => f.ownerUserId === u.id).map((f) => ({ id: f.id, bleMac: f.bleMac, wifiStatus: f.wifiStatus })),
      familyGroup: data.familyGroups.find((g) => g.id === u.familyGroupId) ?? null,
    }));
  res.json(out);
});

adminRouter.post("/admin/users/:id/status", (req, res) => {
  const id = String(req.params.id);
  const status = String(req.body?.status ?? "");
  if (!["active", "suspended", "banned"].includes(status)) {
    res.status(400).json({ ok: false, error: "invalid_status" });
    return;
  }
  let found = false;
  db.mutate((draft) => {
    draft.users = draft.users.map((u) => {
      if (u.id !== id) return u;
      found = true;
      return { ...u, status: status as "active" | "suspended" | "banned" };
    });
    draft.auditLog.unshift({
      id: `audit_${Date.now()}`,
      actor: "superadmin",
      action: "user_status_change",
      target: id,
      atMs: Date.now(),
      meta: { status },
    });
  });
  if (!found) {
    res.status(404).json({ ok: false, error: "user_not_found" });
    return;
  }
  res.json({ ok: true });
});

// Superadmin: Device management
adminRouter.get("/admin/frames", (req, res) => {
  const filter = String(req.query.filter ?? "");
  const data = db.read();
  let frames = data.frames;
  if (filter === "offline_7d") {
    const cut = Date.now() - 7 * 24 * 60 * 60 * 1000;
    frames = frames.filter((f) => !f.lastSeenAtMs || f.lastSeenAtMs < cut);
  } else if (filter === "never_sent_photo") {
    const ids = new Set(data.uploads.map((u) => u.deviceId));
    frames = frames.filter((f) => !ids.has(f.id));
  }
  res.json(
    frames.map((f) => ({
      ...f,
      owner: data.users.find((u) => u.id === f.ownerUserId) ?? null,
      bleProvisionLogs: data.bleProvisionLogs.filter((l) => l.frameId === f.id).slice(0, 20),
    })),
  );
});

adminRouter.post("/admin/frames/:id/ota", (req, res) => {
  const id = String(req.params.id);
  const version = String(req.body?.version ?? "").trim();
  if (!version) {
    res.status(400).json({ ok: false, error: "version_required" });
    return;
  }
  let found = false;
  db.mutate((draft) => {
    draft.frames = draft.frames.map((f) => {
      if (f.id !== id) return f;
      found = true;
      return { ...f, ota: { targetVersion: version, status: "queued" } };
    });
    draft.auditLog.unshift({
      id: `audit_${Date.now()}`,
      actor: "superadmin",
      action: "ota_push",
      target: id,
      atMs: Date.now(),
      meta: { version },
    });
  });
  if (!found) {
    res.status(404).json({ ok: false, error: "frame_not_found" });
    return;
  }
  res.json({ ok: true });
});

adminRouter.get("/admin/frames/:id/ble-logs", (req, res) => {
  const id = String(req.params.id);
  const data = db.read();
  res.json(data.bleProvisionLogs.filter((l) => l.frameId === id));
});

// Superadmin: Content & ops
adminRouter.get("/admin/content/ops", (_req, res) => {
  const data = db.read();
  const stuckUploads = data.uploads.filter((u) => u.deliveredToFrame === false);
  const storageByUser = data.users.map((u) => {
    const ownedFrames = new Set(data.frames.filter((f) => f.ownerUserId === u.id).map((f) => f.id));
    const bytes = data.uploads.filter((up) => ownedFrames.has(up.deviceId)).reduce((a, b) => a + b.bytes, 0);
    return { userId: u.id, email: u.email, bytes };
  });
  res.json({
    queue: { total: data.uploads.length, stuck: stuckUploads.length },
    storageByUser,
    playlists: data.playlists,
    featureFlags: data.featureFlags,
    auditLog: data.auditLog.slice(0, 200),
  });
});

adminRouter.post("/admin/content/notify", (req, res) => {
  const title = String(req.body?.title ?? "").trim();
  const body = String(req.body?.body ?? "").trim();
  if (!title || !body) {
    res.status(400).json({ ok: false, error: "title_body_required" });
    return;
  }
  db.mutate((draft) => {
    for (const u of draft.users) {
      draft.notifications.unshift({
        id: `n_${Date.now()}_${u.id}`,
        userId: u.id,
        type: "admin_broadcast",
        token: null,
        delivered: false,
        atMs: Date.now(),
      });
    }
    draft.auditLog.unshift({
      id: `audit_${Date.now()}`,
      actor: "superadmin",
      action: "broadcast_notify",
      target: "all_users",
      atMs: Date.now(),
      meta: { title, body },
    });
  });
  res.json({ ok: true });
});
