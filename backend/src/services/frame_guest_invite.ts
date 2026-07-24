import crypto from "crypto";
import { db } from "../db/store";

const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateInviteGuestCode(): string {
  const bytes = crypto.randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) {
    s += INVITE_CODE_ALPHABET[bytes[i]! % INVITE_CODE_ALPHABET.length];
  }
  return s;
}

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function lookupFrameInviteDeviceId(rawCode: string): string | null {
  const code = normalizeCode(rawCode);
  if (code.length !== 8) return null;
  const row = db.read().frameGuestInvites?.find((r) => r.code === code);
  return row?.deviceId ?? null;
}

export function getInviteByCode(rawCode: string) {
  const code = normalizeCode(rawCode);
  if (code.length !== 8) return null;
  const row = db.read().frameGuestInvites?.find((r) => r.code === code);
  if (!row) return null;
  return { ...row };
}

export function publicInviteBaseUrl(): string {
  return (
    String(process.env.PUBLIC_INVITE_BASE_URL ?? process.env.PUBLIC_BASE_URL ?? "https://myframe.ink").replace(
      /\/+$/,
      "",
    ) + ""
  );
}

export function createOrFetchInvite(deviceId: string, ownerUserId?: string) {
  const snapshot = db.read();
  const invites = snapshot.frameGuestInvites ?? [];
  const existing = invites.find((r) => r.deviceId === deviceId);
  if (existing) {
    const base = publicInviteBaseUrl();
    return {
      code: existing.code,
      url: `${base}/invite/${existing.code}`,
    };
  }
  let code: string;
  for (let attempt = 0; attempt < 20; attempt++) {
    code = generateInviteGuestCode();
    if (!invites.some((r) => r.code === code)) break;
  }
  const finalCode: string = code!;
  const createdAtMs = Date.now();
  const inv = {
    code: finalCode,
    deviceId,
    ownerUserId: ownerUserId ?? null,
    createdAtMs,
  };
  db.mutate((draft) => {
    if (!draft.frameGuestInvites) draft.frameGuestInvites = [];
    const idx = draft.frameGuestInvites.findIndex((r) => r.deviceId === deviceId);
    if (idx >= 0) {
      draft.frameGuestInvites[idx] = inv;
    } else {
      draft.frameGuestInvites.push(inv);
    }
  });
  const base = publicInviteBaseUrl();
  return {
    code: finalCode,
    url: `${base}/invite/${finalCode}`,
  };
}
