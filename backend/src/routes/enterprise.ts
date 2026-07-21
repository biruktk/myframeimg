import crypto from "crypto";
import express, { Router } from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { db } from "../db/store";
import { hasScope, authenticateEnterpriseApiKey, generateEnterpriseApiKey, hashApiSecret } from "../services/enterprise_api_keys";
import { verifyUserJwtBearer } from "../services/app_user_jwt";

function readBearer(req: express.Request): string | null {
  const raw = String(req.header("authorization") ?? "").trim();
  const m = raw.match(/^Bearer\s+(.+)$/i);
  return (m?.[1] ?? "").trim() || null;
}

function readAdminToken(req: express.Request): string {
  return (readBearer(req) ?? String(req.header("x-admin-token") ?? "")).trim();
}

function isAdmin(req: express.Request): boolean {
  const expected = String(process.env.ADMIN_TOKEN ?? "").trim();
  if (!expected) return false;
  const got = readAdminToken(req);
  return got.length > 0 && got === expected;
}

function parseDeviceIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((x) => String(x ?? "").trim()).filter(Boolean);
  const text = String(raw ?? "").trim();
  if (!text) return [];
  return text.split(",").map((x) => x.trim()).filter(Boolean);
}

function ensureOrgAccess(req: express.Request, orgId: string, neededScope: "devices:read" | "images:write" | "images:read") {
  if (isAdmin(req)) return { ok: true as const, actor: "admin" as const };
  const principal = authenticateEnterpriseApiKey(req);
  if (!principal) return { ok: false as const, status: 401, body: { ok: false, error: "missing_or_invalid_api_key" } };
  if (principal.orgId !== orgId) return { ok: false as const, status: 403, body: { ok: false, error: "org_access_denied" } };
  if (!hasScope(principal, neededScope)) {
    return { ok: false as const, status: 403, body: { ok: false, error: "missing_scope", needed_scope: neededScope } };
  }
  return { ok: true as const, actor: "api_key" as const, principal };
}

export function enterpriseRouter(uploadDir: string, publicBaseUrl: string): Router {
  const router = Router();
  const mediaBase = publicBaseUrl.replace(/\/$/, "");
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, `${Date.now()}_${safe || "upload.bin"}`);
    },
  });
  const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

  router.use(express.json({ limit: "1mb" }));

  router.get("/enterprise/orgs", (req, res) => {
    if (!isAdmin(req)) {
      res.status(401).json({ ok: false, error: "unauthorized_admin_token" });
      return;
    }
    const data = db.read();
    const keyCounts = new Map<string, number>();
    for (const key of data.enterpriseApiKeys) {
      if (key.revokedAtMs == null) keyCounts.set(key.orgId, (keyCounts.get(key.orgId) ?? 0) + 1);
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
    const id = `org_${crypto.randomBytes(5).toString("hex")}`;
    const now = Date.now();
    db.mutate((draft) => {
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
    const requestedScopes = Array.isArray(req.body?.scopes) ? req.body.scopes.map((s: unknown) => String(s)) : [];
    const allowedScopes = ["devices:read", "images:write", "images:read", "commands:write"] as const;
    const scopes = (requestedScopes.length ? requestedScopes : ["devices:read", "images:write"]).filter(
      (s: string): s is (typeof allowedScopes)[number] => (allowedScopes as readonly string[]).includes(s),
    );
    if (scopes.length === 0) {
      res.status(400).json({ ok: false, error: "invalid_scopes" });
      return;
    }
    const data = db.read();
    if (!data.organizations.some((o) => o.id === orgId)) {
      res.status(404).json({ ok: false, error: "org_not_found" });
      return;
    }
    const key = generateEnterpriseApiKey();
    const now = Date.now();
    db.mutate((draft) => {
      draft.enterpriseApiKeys.push({
        id: key.keyId,
        orgId,
        name: name || "Default Key",
        keyPrefix: key.token.slice(0, 12),
        secretHash: hashApiSecret(key.keySecret),
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
    const data = db.read();
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
    db.mutate((draft) => {
      draft.enterpriseApiKeys = draft.enterpriseApiKeys.map((k) => {
        if (k.id !== keyId || k.orgId !== orgId) return k;
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
    const data = db.read();
    if (!data.organizations.some((o) => o.id === orgId)) {
      res.status(404).json({ ok: false, error: "org_not_found" });
      return;
    }
    let found = false;
    db.mutate((draft) => {
      draft.frames = draft.frames.map((f) => {
        if (f.id !== deviceId) return f;
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
    const data = db.read();
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
    const data = db.read();
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
    const data = db.read();
    const orgDeviceSet = new Set(data.frames.filter((f) => f.orgId === orgId).map((f) => f.id));
    const accepted = deviceIds.filter((id) => orgDeviceSet.has(id));
    const rejected = deviceIds.filter((id) => !orgDeviceSet.has(id));
    if (accepted.length === 0) {
      res.status(403).json({ ok: false, error: "no_authorized_devices", rejected });
      return;
    }

    const bytes = fs.readFileSync(file.path);
    const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
    const now = Date.now();
    db.mutate((draft) => {
      for (const deviceId of accepted) {
        draft.uploads.unshift({
          id: `${now}-${Math.random().toString(16).slice(2, 8)}`,
          filename: path.basename(file.path),
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
        meta: { acceptedCount: accepted.length, rejectedCount: rejected.length, filename: path.basename(file.path) },
      });
    });

    res.status(202).json({
      ok: true,
      orgId,
      filename: path.basename(file.path),
      checksum_sha256: checksum,
      image_url: `${mediaBase}/frame-media/${encodeURIComponent(path.basename(file.path))}`,
      accepted_device_ids: accepted,
      rejected_device_ids: rejected,
      queued_count: accepted.length,
    });
  });

  router.get("/enterprise/self/profile", (req, res) => {
    const u = verifyUserJwtBearer(req);
    if (!u) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
    const data = db.read();
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
    const u = verifyUserJwtBearer(req);
    if (!u) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
    const data = db.read();
    const user = data.users.find((x) => x.id === u.userId);
    const orgId = user?.orgId ?? data.organizations[0]?.id ?? "org_default";
    const name = String(req.body?.name ?? "Web Key").trim();
    const requestedScopes = Array.isArray(req.body?.scopes) ? req.body.scopes.map((s: unknown) => String(s)) : [];
    const allowedScopes = ["devices:read", "images:write", "images:read", "commands:write"] as const;
    const scopes = (requestedScopes.length ? requestedScopes : ["devices:read", "images:write"]).filter(
      (s: string): s is (typeof allowedScopes)[number] => (allowedScopes as readonly string[]).includes(s),
    );
    if (scopes.length === 0) {
      res.status(400).json({ ok: false, error: "invalid_scopes" });
      return;
    }
    const key = generateEnterpriseApiKey();
    const now = Date.now();
    db.mutate((draft) => {
      draft.enterpriseApiKeys.push({
        id: key.keyId,
        orgId,
        name: name || "Web Key",
        keyPrefix: key.token.slice(0, 12),
        secretHash: hashApiSecret(key.keySecret),
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
