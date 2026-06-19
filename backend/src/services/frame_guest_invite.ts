import { db } from "../db/store";

export function lookupFrameInviteDeviceId(code: string): string | null {
  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalized.length !== 8) return null;
  const row = db.read().frameGuestInvites?.find((r) => r.code === normalized);
  return row?.deviceId ?? null;
}
