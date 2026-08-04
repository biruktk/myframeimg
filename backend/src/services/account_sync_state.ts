import type { MyframeDb } from "../db/store";
import { normalizeMac } from "./frame_mqtt";

type UserRow = MyframeDb["users"][number];
type FrameRow = MyframeDb["frames"][number];

/** Bump per-user sync version (call inside db.mutate). */
export function bumpUserSyncVersion(user: UserRow): void {
  user.syncVersion = (user.syncVersion ?? 0) + 1;
  user.syncUpdatedAtMs = Date.now();
}

/** Bump sync for every member of a family (join / new shared frame). */
export function bumpFamilyMembersSync(draft: MyframeDb, familyGroupId: string): void {
  const g = draft.familyGroups.find((fg) => fg.id === familyGroupId);
  if (!g) return;
  const memberIds = new Set(g.members.map((m) => m.userId));
  for (const u of draft.users) {
    if (memberIds.has(u.id) || u.familyGroupId === familyGroupId) {
      bumpUserSyncVersion(u);
    }
  }
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

/** True when a frame is ready for family members to cast from anywhere. */
export function isFrameShareReady(f: FrameRow): boolean {
  const named = String((f as { displayName?: string | null }).displayName || "").trim();
  const ssid = String(f.wifiSsid || "").trim();
  // Never share unfinished BLE-only ghosts.
  if (f.wifiStatus === "never_provisioned" && !ssid) return false;
  // Prefer named frames; Wi‑Fi alone is enough so invitees can send (UI falls back to a label).
  return Boolean(named || ssid);
}

/**
 * Keep familyGroups.frameIds in sync with frames the family can use:
 * - owned by any member, OR
 * - already shared to any member (same as mini-app: access you have → family can use)
 * Call inside db.mutate after create/join/bind.
 */
export function reconcileFamilyFrameIds(draft: MyframeDb, familyGroupId: string): string[] {
  const g = draft.familyGroups.find((fg) => fg.id === familyGroupId);
  if (!g) return [];
  const memberIds = new Set(g.members.map((m) => m.userId));
  const ids = new Set<string>(Array.isArray(g.frameIds) ? g.frameIds : []);
  for (const f of draft.frames) {
    if (!isFrameShareReady(f)) continue;
    const ownedByMember = memberIds.has(f.ownerUserId);
    const sharedToMember = (f.sharedToUserIds || []).some((uid) => memberIds.has(uid));
    if (!ownedByMember && !sharedToMember) continue;
    ids.add(f.id);
  }
  g.frameIds = [...ids];
  return g.frameIds;
}

/**
 * Cascade frame access to a family member (junction-table equivalent):
 * - refresh familyGroups.frameIds from members' owned + shared frames
 * - add memberUserId to each of those frames' sharedToUserIds
 *
 * NEVER mutates frame.ownerUserId — the hardware owner stays the owner.
 * Call inside db.mutate after the member row is inserted.
 */
export function grantFamilyFramesToMember(
  draft: MyframeDb,
  familyGroupId: string,
  memberUserId: string,
): string[] {
  const frameIds = reconcileFamilyFrameIds(draft, familyGroupId);
  const g = draft.familyGroups.find((fg) => fg.id === familyGroupId);
  if (!g) return frameIds;

  const memberIds = new Set(g.members.map((m) => m.userId));
  const granted = new Set<string>(frameIds);

  for (const f of draft.frames) {
    // Snapshot owner — join must never rewrite this field.
    const ownerBefore = f.ownerUserId;

    if (!isFrameShareReady(f) && !granted.has(f.id)) continue;
    const ownedByMember = memberIds.has(f.ownerUserId);
    const sharedToMember = (f.sharedToUserIds || []).some((uid) => memberIds.has(uid));
    if (!ownedByMember && !sharedToMember && !granted.has(f.id)) continue;

    if (!granted.has(f.id)) {
      granted.add(f.id);
      if (!Array.isArray(g.frameIds)) g.frameIds = [];
      if (!g.frameIds.includes(f.id)) g.frameIds.push(f.id);
    }

    // Owner already has full access — do not demote them into sharedToUserIds.
    if (f.ownerUserId === memberUserId) continue;
    if (!Array.isArray(f.sharedToUserIds)) f.sharedToUserIds = [];
    if (!f.sharedToUserIds.includes(memberUserId)) {
      f.sharedToUserIds.push(memberUserId);
    }

    // Hard guard: ownership is immutable during family share grants.
    if (f.ownerUserId !== ownerBefore) {
      f.ownerUserId = ownerBefore;
    }
  }

  g.frameIds = [...granted];
  return g.frameIds;
}

/**
 * Attach one frame to a user's family list after bind/provision/share.
 * Uses the frame owner's family when present; otherwise any family that
 * already includes a user with access to this frame.
 */
export function attachFrameToOwnerFamily(draft: MyframeDb, frame: FrameRow): void {
  if (!isFrameShareReady(frame)) return;

  let gid = draft.users.find((u) => u.id === frame.ownerUserId)?.familyGroupId ?? null;
  if (!gid) {
    // Frame may be used via sharedToUserIds (Flutter/WeChat invite) — attach to that member's family.
    for (const uid of frame.sharedToUserIds || []) {
      const u = draft.users.find((x) => x.id === uid);
      if (u?.familyGroupId) {
        gid = u.familyGroupId;
        break;
      }
    }
  }
  if (!gid) return;
  const g = draft.familyGroups.find((fg) => fg.id === gid);
  if (!g) return;
  if (!Array.isArray(g.frameIds)) g.frameIds = [];
  if (!g.frameIds.includes(frame.id)) g.frameIds.push(frame.id);
  bumpFamilyMembersSync(draft, gid);
}

/**
 * Frames a user can list + cast to:
 * - own frames
 * - explicit sharedToUserIds
 * - any provisioned frame owned by someone in the same family
 * - IDs listed on familyGroups.frameIds
 *
 * Unfinished (unnamed / never Wi‑Fi) frames stay private to the pairing phone
 * except the owner always sees their own setup-in-progress frames.
 */
export function visibleFramesForUser(data: MyframeDb, userId: string): FrameRow[] {
  const user = data.users.find((u) => u.id === userId);
  const ids = new Set<string>();
  const familyMemberIds = new Set<string>([userId]);

  if (user?.familyGroupId) {
    const g = data.familyGroups.find((fg) => fg.id === user.familyGroupId);
    if (g) {
      for (const m of g.members) familyMemberIds.add(m.userId);
      for (const fid of g.frameIds || []) ids.add(fid);
    }
  }

  for (const f of data.frames) {
    if (f.ownerUserId === userId) ids.add(f.id);
    if (familyMemberIds.has(f.ownerUserId)) ids.add(f.id);
    if (Array.isArray(f.sharedToUserIds) && f.sharedToUserIds.includes(userId)) {
      ids.add(f.id);
    }
    const legacyFamilyId = (f as { familyId?: string | null }).familyId;
    if (legacyFamilyId && user?.familyGroupId && legacyFamilyId === user.familyGroupId) {
      ids.add(f.id);
    }
  }

  return data.frames.filter((f) => {
    if (!ids.has(f.id)) return false;
    // Owner always sees their own unfinished frames (setup on their phone).
    if (f.ownerUserId === userId) return true;
    return isFrameShareReady(f);
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
