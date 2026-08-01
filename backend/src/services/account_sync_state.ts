import type { MyframeDb } from "../db/store";
import { normalizeMac } from "./frame_mqtt";

type UserRow = MyframeDb["users"][number];
type FrameRow = MyframeDb["frames"][number];

/** Bump per-user sync version (call inside db.mutate). */
export function bumpUserSyncVersion(user: UserRow): void {
  user.syncVersion = (user.syncVersion ?? 0) + 1;
  user.syncUpdatedAtMs = Date.now();
}

/** ESP32 Wi‑Fi STA is often BLE MAC with last byte - 2. */
export function relatedMacKeys(raw: string): string[] {
  const n = normalizeMac(raw);
  if (!n || n.length < 12) return n ? [n] : [];
  const keys = new Set<string>([n]);
  try {
    const v = BigInt("0x" + n);
    const asSta = (v - 2n).toString(16).toUpperCase().padStart(12, "0");
    const asBle = (v + 2n).toString(16).toUpperCase().padStart(12, "0");
    if (asSta.length === 12) keys.add(asSta);
    if (asBle.length === 12) keys.add(asBle);
  } catch {
    /* ignore */
  }
  return [...keys];
}

export function findFrameByMac(data: MyframeDb, rawMac: string): FrameRow | undefined {
  const keys = new Set(relatedMacKeys(rawMac));
  if (!keys.size) return undefined;
  return data.frames.find((f) => {
    const cands = [f.bleMac, f.id, f.stationMac ?? ""].flatMap((x) => relatedMacKeys(x));
    return cands.some((c) => keys.has(c));
  });
}

export function visibleFramesForUser(data: MyframeDb, userId: string): FrameRow[] {
  const user = data.users.find((u) => u.id === userId);
  const ids = new Set<string>();
  for (const f of data.frames) {
    if (f.ownerUserId === userId) ids.add(f.id);
    if (Array.isArray(f.sharedToUserIds) && f.sharedToUserIds.includes(userId)) ids.add(f.id);
    const legacyFamilyId = (f as { familyId?: string | null }).familyId;
    if (legacyFamilyId && user?.familyGroupId && legacyFamilyId === user.familyGroupId) {
      ids.add(f.id);
    }
  }
  if (user?.familyGroupId) {
    const g = data.familyGroups.find((fg) => fg.id === user.familyGroupId);
    if (g) {
      for (const fid of g.frameIds) ids.add(fid);
    }
  }
  // Only share frames that finished setup (named + Wi-Fi).
  // BLE-paired-but-not-provisioned must stay private to the pairing phone.
  return data.frames.filter((f) => {
    if (!ids.has(f.id)) return false;
    const named = String((f as { displayName?: string | null }).displayName || "").trim();
    if (!named) return false;
    const ssid = String(f.wifiSsid || "").trim();
    if (f.wifiStatus === "never_provisioned" && !ssid) return false;
    return true;
  });
}

export function frameDisplayName(f: FrameRow): string {
  return String((f as { displayName?: string | null }).displayName || "").trim();
}

/** Playlist structure only — photo IDs, no binary payloads. */
export function playlistsMetaForUser(data: MyframeDb, userId: string) {
  const visible = new Set(visibleFramesForUser(data, userId).map((f) => f.id));
  return data.playlists
    .filter((p) => {
      if (p.system) return false;
      const owner = (p as { ownerUserId?: string | null }).ownerUserId;
      if (owner) return owner === userId;
      if (!p.assignedFrameIds?.length) return false; // unowned orphans stay private
      return p.assignedFrameIds.some((fid) => visible.has(fid));
    })
    .map((p) => ({
      id: p.id,
      name: p.title,
      title: p.title,
      photo_ids: Array.isArray(p.photoIds) ? p.photoIds : [],
      photoIds: Array.isArray(p.photoIds) ? p.photoIds : [],
      photo_count: Array.isArray(p.photoIds) ? p.photoIds.length : 0,
      frame_ids: Array.isArray(p.assignedFrameIds) ? p.assignedFrameIds : [],
      schedule_rule: p.scheduleRule ?? null,
    }));
}
