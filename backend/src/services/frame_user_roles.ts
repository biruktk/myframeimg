import type { MyframeDb } from "../db/store";

export type FrameUserRole = "OWNER" | "MEMBER";

export type FrameUserRoleRow = {
  frameId: string;
  userId: string;
  role: FrameUserRole;
  createdAtMs: number;
};

/** Ensure the junction table exists on the JSON store draft. */
export function ensureFrameUserRoles(draft: MyframeDb): FrameUserRoleRow[] {
  if (!Array.isArray(draft.frameUserRoles)) {
    draft.frameUserRoles = [];
  }
  return draft.frameUserRoles as FrameUserRoleRow[];
}

/**
 * Backfill frame_user_roles from legacy ownerUserId / sharedToUserIds.
 * Never demotes an existing OWNER row to MEMBER.
 * Returns number of rows inserted.
 */
export function migrateFrameUserRolesFromLegacy(draft: MyframeDb): number {
  const roles = ensureFrameUserRoles(draft);
  const key = (frameId: string, userId: string) => `${frameId}\0${userId}`;
  const existing = new Map(roles.map((r) => [key(r.frameId, r.userId), r]));
  let inserted = 0;
  const now = Date.now();

  for (const f of draft.frames || []) {
    const frameId = String(f.id || "").trim();
    if (!frameId) continue;

    const ownerId = String(f.ownerUserId || "").trim();
    if (ownerId && ownerId !== "usr_1") {
      const k = key(frameId, ownerId);
      const row = existing.get(k);
      if (!row) {
        const next: FrameUserRoleRow = {
          frameId,
          userId: ownerId,
          role: "OWNER",
          createdAtMs: now,
        };
        roles.push(next);
        existing.set(k, next);
        inserted += 1;
      } else if (row.role !== "OWNER") {
        row.role = "OWNER";
      }
    }

    for (const uid of f.sharedToUserIds || []) {
      const userId = String(uid || "").trim();
      if (!userId) continue;
      const k = key(frameId, userId);
      const row = existing.get(k);
      if (!row) {
        const next: FrameUserRoleRow = {
          frameId,
          userId,
          role: "MEMBER",
          createdAtMs: now,
        };
        roles.push(next);
        existing.set(k, next);
        inserted += 1;
      }
      // Existing OWNER stays OWNER (never demote via shared list).
    }
  }

  return inserted;
}

/**
 * Upsert a frame↔user role.
 * - OWNER always wins (promotes MEMBER → OWNER).
 * - MEMBER never demotes an existing OWNER.
 */
export function upsertFrameUserRole(
  draft: MyframeDb,
  frameId: string,
  userId: string,
  role: FrameUserRole,
): FrameUserRoleRow {
  const roles = ensureFrameUserRoles(draft);
  const fid = String(frameId || "").trim();
  const uid = String(userId || "").trim();
  const idx = roles.findIndex((r) => r.frameId === fid && r.userId === uid);
  if (idx >= 0) {
    const row = roles[idx]!;
    // MEMBER never demotes OWNER; OWNER always wins.
    if (role === "OWNER") {
      row.role = "OWNER";
    }
    return row;
  }
  const next: FrameUserRoleRow = {
    frameId: fid,
    userId: uid,
    role,
    createdAtMs: Date.now(),
  };
  roles.push(next);
  return next;
}

export function removeFrameUserRole(
  draft: MyframeDb,
  frameId: string,
  userId: string,
): boolean {
  const roles = ensureFrameUserRoles(draft);
  const fid = String(frameId || "").trim();
  const uid = String(userId || "").trim();
  const before = roles.length;
  draft.frameUserRoles = roles.filter((r) => !(r.frameId === fid && r.userId === uid));
  return (draft.frameUserRoles as FrameUserRoleRow[]).length < before;
}

export function removeAllFrameUserRoles(draft: MyframeDb, frameId: string): void {
  const roles = ensureFrameUserRoles(draft);
  const fid = String(frameId || "").trim();
  draft.frameUserRoles = roles.filter((r) => r.frameId !== fid);
}

export function getFrameUserRole(
  data: MyframeDb,
  frameId: string,
  userId: string,
): FrameUserRole | null {
  const roles = Array.isArray(data.frameUserRoles)
    ? (data.frameUserRoles as FrameUserRoleRow[])
    : [];
  const fid = String(frameId || "").trim();
  const uid = String(userId || "").trim();
  const row = roles.find((r) => r.frameId === fid && r.userId === uid);
  if (row) return row.role;

  // Legacy fallback until migration runs.
  const frame = (data.frames || []).find((f) => f.id === fid);
  if (!frame) return null;
  if (String(frame.ownerUserId || "") === uid) return "OWNER";
  if ((frame.sharedToUserIds || []).includes(uid)) return "MEMBER";
  return null;
}

export function isFrameOwner(
  data: MyframeDb,
  frameId: string,
  userId: string,
): boolean {
  return getFrameUserRole(data, frameId, userId) === "OWNER";
}

export function listFrameOwners(data: MyframeDb, frameId: string): string[] {
  const roles = Array.isArray(data.frameUserRoles)
    ? (data.frameUserRoles as FrameUserRoleRow[])
    : [];
  const fid = String(frameId || "").trim();
  const owners = roles.filter((r) => r.frameId === fid && r.role === "OWNER").map((r) => r.userId);
  if (owners.length) return [...new Set(owners)];
  const frame = (data.frames || []).find((f) => f.id === fid);
  const legacy = String(frame?.ownerUserId || "").trim();
  return legacy && legacy !== "usr_1" ? [legacy] : [];
}

/**
 * Manual Bluetooth bind: grant OWNER without demoting/removing other owners.
 * Keeps legacy ownerUserId as primary pointer (set only when empty/demo).
 * Removes the user from sharedToUserIds so they are not double-listed as MEMBER.
 */
export function grantBluetoothCoOwner(
  draft: MyframeDb,
  frame: MyframeDb["frames"][number],
  userId: string,
): void {
  upsertFrameUserRole(draft, frame.id, userId, "OWNER");
  const existingOwner = String(frame.ownerUserId || "").trim();
  if (!existingOwner || existingOwner === "usr_1") {
    frame.ownerUserId = userId;
  }
  if (!Array.isArray(frame.sharedToUserIds)) frame.sharedToUserIds = [];
  frame.sharedToUserIds = frame.sharedToUserIds.filter((id) => id !== userId);
}

/** Remote invite / family join: always MEMBER; never demotes OWNER. */
export function grantRemoteMember(
  draft: MyframeDb,
  frame: MyframeDb["frames"][number],
  userId: string,
): void {
  upsertFrameUserRole(draft, frame.id, userId, "MEMBER");
  if (isFrameOwner(draft, frame.id, userId)) return;
  if (!Array.isArray(frame.sharedToUserIds)) frame.sharedToUserIds = [];
  if (!frame.sharedToUserIds.includes(userId)) {
    frame.sharedToUserIds.push(userId);
  }
}

/** After a co-owner leaves, keep legacy ownerUserId pointing at a remaining OWNER. */
export function reassignLegacyOwnerUserId(
  draft: MyframeDb,
  frame: MyframeDb["frames"][number],
): void {
  const owners = listFrameOwners(draft, frame.id).filter((id) => id !== frame.ownerUserId);
  if (isFrameOwner(draft, frame.id, frame.ownerUserId)) return;
  if (owners.length) {
    frame.ownerUserId = owners[0]!;
  }
}
