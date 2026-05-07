import crypto from "crypto";
import type { Request } from "express";
import { db } from "../db/store";

export type EnterpriseScope = "devices:read" | "images:write" | "images:read" | "commands:write";

export type EnterprisePrincipal = {
  orgId: string;
  keyId: string;
  scopes: EnterpriseScope[];
};

function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function readBearer(req: Request): string | null {
  const raw = String(req.header("authorization") ?? "").trim();
  const m = raw.match(/^Bearer\s+(.+)$/i);
  const tok = (m?.[1] ?? "").trim();
  return tok || null;
}

function readApiKey(req: Request): string | null {
  const direct = String(req.header("x-api-key") ?? "").trim();
  if (direct) return direct;
  return readBearer(req);
}

function secureEqualHex(aHex: string, bHex: string): boolean {
  try {
    const a = Buffer.from(aHex, "hex");
    const b = Buffer.from(bHex, "hex");
    if (a.length !== b.length || a.length === 0) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function authenticateEnterpriseApiKey(req: Request): EnterprisePrincipal | null {
  const token = readApiKey(req);
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const keyId = token.slice(0, dot).trim();
  const secret = token.slice(dot + 1).trim();
  if (!keyId || !secret) return null;

  const data = db.read();
  const key = data.enterpriseApiKeys.find((k) => k.id === keyId);
  if (!key) return null;
  if (key.revokedAtMs != null) return null;
  if (key.expiresAtMs != null && Date.now() > key.expiresAtMs) return null;
  const secretHash = sha256(secret);
  if (!secureEqualHex(secretHash, key.secretHash)) return null;

  db.mutate((draft) => {
    draft.enterpriseApiKeys = draft.enterpriseApiKeys.map((k) =>
      k.id === keyId ? { ...k, lastUsedAtMs: Date.now() } : k,
    );
  });
  return { orgId: key.orgId, keyId: key.id, scopes: key.scopes };
}

export function hasScope(principal: EnterprisePrincipal, scope: EnterpriseScope): boolean {
  return principal.scopes.includes(scope);
}

export function generateEnterpriseApiKey(): { keyId: string; keySecret: string; token: string } {
  const keyId = `mk_live_${crypto.randomBytes(6).toString("hex")}`;
  const keySecret = crypto.randomBytes(24).toString("hex");
  return { keyId, keySecret, token: `${keyId}.${keySecret}` };
}

export function hashApiSecret(secret: string): string {
  return sha256(secret);
}
