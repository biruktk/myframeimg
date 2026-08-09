import crypto from "crypto";
import express, { Request, Response, Router } from "express";
import type { MyframeDb } from "../db/store";
import { db } from "../db/store";
import { verifyUserJwtBearer } from "../services/app_user_jwt";
import {
  bumpFamilyMembersSync,
  bumpUserSyncVersion,
  grantFamilyFramesToMember,
  reconcileFamilyFrameIds,
} from "../services/account_sync_state";
import { sendPushToUser } from "../services/firebase_admin";

export const familyRouter = Router();

// Some released iOS builds send JSON as text/plain. Parse it only for this
// endpoint; the main app remains the canonical JSON parser for all others.
familyRouter.use("/family/join", express.text({ type: "text/plain", limit: "64kb" }));

// Body parsing is handled by the main app (express.json({ limit: "2mb" }))
// Do NOT add another express.json() here -- it consumes the stream and leaves req.body empty.

function authUser(req: Request, res: Response): { userId: string } | null {
  const u = verifyUserJwtBearer(req);
  if (!u) {
    res.status(401).json({ ok: false, error: "unauthorized", message: "Missing or invalid token" });
    return null;
  }
  return { userId: u.userId };
}

/** Canonical invite form: NFKC → trim → upper → strip spaces/hyphens. */
export function normalizeInviteCode(raw: unknown): string {
  return String(raw ?? "")
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(/[\s\-]+/g, "");
}

function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) {
    s += alphabet[bytes[i]! % alphabet.length];
  }
  return s;
}

function generateUniqueInviteCode(draft: MyframeDb, excludeGroupId?: string): string {
  for (let attempt = 0; attempt < 24; attempt++) {
    const code = generateInviteCode();
    const taken = draft.familyGroups.some(
      (g) =>
        g.id !== excludeGroupId &&
        normalizeInviteCode(g.inviteCode) === code,
    );
    if (!taken) return code;
  }
  // Extremely unlikely; still return a fresh code.
  return generateInviteCode();
}

function findFamilyByInviteCode(
  groups: MyframeDb["familyGroups"],
  inputCode: string,
) {
  const want = normalizeInviteCode(inputCode);
  if (!want) return undefined;
  return groups.find((fg) => normalizeInviteCode(fg.inviteCode) === want);
}

function codeDebug(label: string, value: unknown): {
  label: string;
  raw: string;
  norm: string;
  rawLen: number;
  normLen: number;
  hex: string;
} {
  const raw = String(value ?? "");
  const norm = normalizeInviteCode(raw);
  return {
    label,
    raw,
    norm,
    rawLen: raw.length,
    normLen: norm.length,
    hex: Buffer.from(raw, "utf8").toString("hex"),
  };
}

/** Remove user from their current group only (used by DELETE /leave). */
function leaveUserCurrentFamily(draft: MyframeDb, userId: string): void {
  const uidx = draft.users.findIndex((u) => u.id === userId);
  if (uidx < 0) return;
  const gid = draft.users[uidx]!.familyGroupId;
  if (!gid) return;
  const gidx = draft.familyGroups.findIndex((g) => g.id === gid);
  if (gidx >= 0) {
    draft.familyGroups[gidx]!.members = draft.familyGroups[gidx]!.members.filter(
      (m) => m.userId !== userId,
    );
    if (draft.familyGroups[gidx]!.members.length === 0) {
      draft.familyGroups.splice(gidx, 1);
    }
  }
  draft.users[uidx] = {
    ...draft.users[uidx]!,
    familyGroupId: null,
  };
}

/** Remove user from any family group and clear [users.familyGroupId]. Drops empty groups. */
function detachUserFromFamily(draft: MyframeDb, userId: string): void {
  for (const g of draft.familyGroups) {
    g.members = g.members.filter((m) => m.userId !== userId);
  }
  draft.familyGroups = draft.familyGroups.filter((g) => g.members.length > 0);
  const uidx = draft.users.findIndex((u) => u.id === userId);
  if (uidx >= 0) {
    draft.users[uidx] = {
      ...draft.users[uidx]!,
      familyGroupId: null,
    };
  }
}

/** POST /api/family/create */
familyRouter.post("/family/create", (req, res) => {
  const auth = authUser(req, res);
  if (!auth) return;

  const name = String(req.body?.name ?? "Our family").trim() || "Our family";

  let newId = "";
  let inviteCode = "";

  db.mutate((draft) => {
    detachUserFromFamily(draft, auth.userId);

    newId = `fam_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    inviteCode = generateUniqueInviteCode(draft);

    draft.familyGroups.push({
      id: newId,
      name,
      inviteCode,
      members: [{ userId: auth.userId, role: "owner" }],
      frameIds: [],
    });

    const uidx = draft.users.findIndex((u) => u.id === auth.userId);
    if (uidx >= 0) {
      draft.users[uidx] = {
        ...draft.users[uidx]!,
        familyGroupId: newId,
      };
      bumpUserSyncVersion(draft.users[uidx]!);
    }

    // Share the owner's already-provisioned frames with the new family.
    const shared = reconcileFamilyFrameIds(draft, newId);
    console.log(
      "[family/create] attached_frames",
      JSON.stringify({ familyId: newId, frameIds: shared }),
    );
  });

  console.log(
    "[family/create]",
    JSON.stringify({ userId: auth.userId, familyId: newId, inviteCode }),
  );

  res.status(201).json({
    ok: true,
    familyId: newId,
    inviteCode,
  });
});

/** POST /api/family/join */
familyRouter.post("/family/join", (req, res) => {
  const auth = authUser(req, res);
  if (!auth) return;

  let parsedJoinBody: unknown = req.body;
  if (typeof parsedJoinBody === "string") {
    try {
      parsedJoinBody = JSON.parse(parsedJoinBody);
    } catch {
      parsedJoinBody = {};
    }
  }
  const joinBody = (parsedJoinBody && typeof parsedJoinBody === "object"
    ? parsedJoinBody
    : {}) as Record<string, unknown>;
  const joinQuery = (req.query && typeof req.query === "object" ? req.query : {}) as Record<string, unknown>;
  const inviteRaw = [
    joinBody.inviteCode,
    joinBody.invite_code,
    joinBody.familyCode,
    joinBody.family_code,
    joinBody.code,
    joinQuery.inviteCode,
    joinQuery.invite_code,
    joinQuery.familyCode,
    joinQuery.family_code,
    joinQuery.code,
  ].find((value) => String(value ?? "").trim()) ?? "";
  const inviteCodeNorm = normalizeInviteCode(inviteRaw);
  if (inviteCodeNorm.length !== 8) {
    console.log(
      "[family/join] invalid_length",
      JSON.stringify({
        userId: auth.userId,
        contentType: req.header("content-type") ?? "",
        contentLength: req.header("content-length") ?? "",
        bodyKeys: req.body && typeof req.body === "object" ? Object.keys(req.body) : [],
        queryKeys: Object.keys(req.query ?? {}),
        ...codeDebug("received", inviteRaw),
      }),
    );
    res.status(400).json({
      ok: false,
      error: "invalid_invite",
      message: "Invite code must be 8 characters",
    });
    return;
  }

  const snapshot = db.read();
  const storedCodes: Array<{
    id: string;
    label: string;
    raw: string;
    norm: string;
    rawLen: number;
    normLen: number;
    hex: string;
  }> = snapshot.familyGroups.map((fg) => ({
    id: fg.id,
    ...codeDebug("stored", fg.inviteCode),
  }));
  console.log(
    "[family/join] verify",
    JSON.stringify({
      userId: auth.userId,
      ...codeDebug("received", inviteRaw),
      storedCodes,
    }),
  );

  const targetGroup = findFamilyByInviteCode(snapshot.familyGroups, inviteCodeNorm);
  if (!targetGroup) {
    console.log(
      "[family/join] not_found",
      JSON.stringify({
        userId: auth.userId,
        want: inviteCodeNorm,
        available: storedCodes.map((c) => c.norm),
      }),
    );
    res.status(404).json({
      ok: false,
      error: "not_found",
      message: "No family matches that invite code",
    });
    return;
  }

  const alreadyMember =
    targetGroup.members.some((m) => m.userId === auth.userId) ||
    snapshot.users.find((u) => u.id === auth.userId)?.familyGroupId ===
      targetGroup.id;

  if (alreadyMember) {
    console.log(
      "[family/join] already_member",
      JSON.stringify({
        userId: auth.userId,
        familyId: targetGroup.id,
        inviteCode: normalizeInviteCode(targetGroup.inviteCode),
      }),
    );
    res.status(409).json({
      ok: false,
      error: "already_member",
      message: "You are already in this family circle",
      familyId: targetGroup.id,
    });
    return;
  }

  const targetId = targetGroup.id;

  let sharedFrameIds: string[] = [];
  let memberCount = 0;
  let joinerName = "";

  db.mutate((draft) => {
    // Leave any other family first (never detach from target — already checked).
    detachUserFromFamily(draft, auth.userId);

    const gidx = draft.familyGroups.findIndex((g) => g.id === targetId);
    if (gidx < 0) return;
    const has = draft.familyGroups[gidx]!.members.some(
      (m) => m.userId === auth.userId,
    );
    if (!has) {
      draft.familyGroups[gidx]!.members.push({
        userId: auth.userId,
        role: "member",
      });
    }

    // Re-normalize stored code so future lookups stay consistent.
    draft.familyGroups[gidx]!.inviteCode = normalizeInviteCode(
      draft.familyGroups[gidx]!.inviteCode,
    );

    const uidx = draft.users.findIndex((u) => u.id === auth.userId);
    if (uidx >= 0) {
      draft.users[uidx] = {
        ...draft.users[uidx]!,
        familyGroupId: targetId,
      };
      joinerName =
        String(draft.users[uidx]!.name || "").trim() ||
        String(draft.users[uidx]!.email || "").split("@")[0] ||
        "Someone";
    }

    // Cascade: family frame pool + per-frame sharedToUserIds for the joiner
    // (JSON-store equivalent of user_frame_permissions MEMBER grants).
    // CRITICAL: this MUST NOT mutate any frame.ownerUserId.
    const ownersBefore = new Map(
      draft.frames.map((f) => [f.id, f.ownerUserId] as const),
    );
    sharedFrameIds = grantFamilyFramesToMember(draft, targetId, auth.userId);
    for (const f of draft.frames) {
      const before = ownersBefore.get(f.id);
      if (before !== undefined && f.ownerUserId !== before) {
        console.error(
          "[family/join] BLOCKED owner transfer",
          JSON.stringify({
            frameId: f.id,
            from: f.ownerUserId,
            restore: before,
            joiner: auth.userId,
          }),
        );
        f.ownerUserId = before;
      }
    }
    memberCount = draft.familyGroups[gidx]!.members.length;
    bumpFamilyMembersSync(draft, targetId);
  });

  console.log(
    "[family/join] ok",
    JSON.stringify({
      userId: auth.userId,
      familyId: targetId,
      inviteCode: inviteCodeNorm,
      sharedFrameIds,
      memberCount,
    }),
  );

  // Notify existing members (owner) so their Family tab can refresh.
  const notifyTargets = targetGroup.members
    .map((m) => m.userId)
    .filter((id) => id && id !== auth.userId);
  for (const uid of notifyTargets) {
    sendPushToUser(
      uid,
      "Family member joined",
      `${joinerName || "A member"} joined your MyFrame family.`,
    ).catch((e) =>
      console.error("[family/join] push failed", uid, e),
    );
  }

  // Fresh member roster for the joining client (no stale cache).
  const after = db.read();
  const groupAfter = after.familyGroups.find((g) => g.id === targetId);
  const members = (groupAfter?.members ?? []).map((m) => {
    const u = after.users.find((x) => x.id === m.userId);
    return {
      userId: m.userId,
      name: u?.name ?? "(unknown)",
      email: u?.email ?? "",
      role: m.role,
    };
  });

  res.json({
    ok: true,
    familyId: targetId,
    frameIds: sharedFrameIds,
    memberCount,
    members,
  });
});

/** GET /api/family/members */
familyRouter.get("/family/members", (_req, res) => {
  const auth = authUser(_req, res);
  if (!auth) return;

  const data0 = db.read();
  const user0 = data0.users.find((u) => u.id === auth.userId);
  const gid0 = user0?.familyGroupId;
  if (!gid0) {
    res.status(404).json({ ok: false, error: "no_family" });
    return;
  }

  // Keep frame pool fresh so members always see each other's provisioned frames.
  db.mutate((draft) => {
    reconcileFamilyFrameIds(draft, gid0);
  });

  const data = db.read();
  const user = data.users.find((u) => u.id === auth.userId);
  const gid = user?.familyGroupId;
  if (!gid) {
    res.status(404).json({ ok: false, error: "no_family" });
    return;
  }

  let group = data.familyGroups.find((g) => g.id === gid);
  if (!group) {
    res.status(404).json({ ok: false, error: "no_family" });
    return;
  }

  // Heal legacy groups that somehow lack a usable invite code.
  let inviteCode = normalizeInviteCode(group.inviteCode);
  if (inviteCode.length !== 8) {
    db.mutate((draft) => {
      const gidx = draft.familyGroups.findIndex((g) => g.id === gid);
      if (gidx < 0) return;
      inviteCode = generateUniqueInviteCode(draft, gid);
      draft.familyGroups[gidx]!.inviteCode = inviteCode;
    });
    group = db.read().familyGroups.find((g) => g.id === gid) ?? group;
  }

  const members = group.members.map((m) => {
    const u = data.users.find((x) => x.id === m.userId);
    return {
      userId: m.userId,
      name: u?.name ?? "(unknown)",
      email: u?.email ?? "",
      avatar: null as string | null,
      role: m.role,
    };
  });

  res.json({
    ok: true,
    familyId: group.id,
    familyName: group.name,
    inviteCode,
    frameIds: Array.isArray(group.frameIds) ? group.frameIds : [],
    members,
  });
});

/**
 * GET /api/family/invite — return the existing invite code (no regeneration).
 * Also mounted as GET /api/v1/family/invite_code.
 */
function handleGetInviteCode(req: Request, res: Response): void {
  const auth = authUser(req, res);
  if (!auth) return;

  const data = db.read();
  const user = data.users.find((u) => u.id === auth.userId);
  const gid = user?.familyGroupId;
  if (!gid) {
    res.status(404).json({ ok: false, error: "no_family" });
    return;
  }

  const group = data.familyGroups.find((g) => g.id === gid);
  if (!group) {
    res.status(404).json({ ok: false, error: "no_family" });
    return;
  }

  let inviteCode = normalizeInviteCode(group.inviteCode);
  // Only generate when the stored value is missing/invalid — never on every read.
  if (inviteCode.length !== 8) {
    db.mutate((draft) => {
      const gidx = draft.familyGroups.findIndex((g) => g.id === gid);
      if (gidx < 0) return;
      inviteCode = generateUniqueInviteCode(draft, gid);
      draft.familyGroups[gidx]!.inviteCode = inviteCode;
    });
  }

  res.json({
    ok: true,
    familyId: gid,
    inviteCode,
  });
}

familyRouter.get("/family/invite", handleGetInviteCode);
familyRouter.get("/v1/family/invite_code", handleGetInviteCode);

/** DELETE /api/family/members/:userId — owner removes a member. */
familyRouter.delete("/family/members/:userId", (req, res) => {
  const auth = authUser(req, res);
  if (!auth) return;

  const targetUserId = String(req.params.userId ?? "").trim();
  if (!targetUserId || targetUserId === auth.userId) {
    res.status(400).json({ ok: false, error: "invalid_member" });
    return;
  }

  const data = db.read();
  const me = data.users.find((u) => u.id === auth.userId);
  const gid = me?.familyGroupId;
  if (!gid) {
    res.status(404).json({ ok: false, error: "no_family" });
    return;
  }
  const group = data.familyGroups.find((g) => g.id === gid);
  if (!group) {
    res.status(404).json({ ok: false, error: "no_family" });
    return;
  }
  const isOwner = group.members.some(
    (m) => m.userId === auth.userId && m.role === "owner",
  );
  if (!isOwner) {
    res.status(403).json({ ok: false, error: "forbidden" });
    return;
  }
  const target = group.members.find((m) => m.userId === targetUserId);
  if (!target) {
    res.status(404).json({ ok: false, error: "not_found" });
    return;
  }
  if (target.role === "owner") {
    res.status(400).json({ ok: false, error: "cannot_remove_owner" });
    return;
  }

  db.mutate((draft) => {
    leaveUserCurrentFamily(draft, targetUserId);
    // Refresh frame pool for remaining members (removed user's frames drop out).
    reconcileFamilyFrameIds(draft, gid);
    bumpFamilyMembersSync(draft, gid);
    const removed = draft.users.find((u) => u.id === targetUserId);
    if (removed) bumpUserSyncVersion(removed);
  });

  res.json({ ok: true });
});

/** DELETE /api/family/leave */
familyRouter.delete("/family/leave", (req, res) => {
  const auth = authUser(req, res);
  if (!auth) return;

  db.mutate((draft) => {
    const u = draft.users.find((x) => x.id === auth.userId);
    const gid = u?.familyGroupId ?? null;
    leaveUserCurrentFamily(draft, auth.userId);
    if (gid && draft.familyGroups.some((g) => g.id === gid)) {
      reconcileFamilyFrameIds(draft, gid);
      bumpFamilyMembersSync(draft, gid);
    }
    const after = draft.users.find((x) => x.id === auth.userId);
    if (after) bumpUserSyncVersion(after);
  });

  res.json({ ok: true });
});

/** POST /api/family/invite/rotate — persists a new code immediately. */
function handleRotateInvite(_req: Request, res: Response): void {
  const auth = authUser(_req, res);
  if (!auth) return;

  const data = db.read();
  const user = data.users.find((u) => u.id === auth.userId);
  const gid = user?.familyGroupId;
  if (!gid) {
    res.status(404).json({ ok: false, error: "no_family" });
    return;
  }

  const group = data.familyGroups.find((g) => g.id === gid);
  if (!group) {
    res.status(404).json({ ok: false, error: "no_family" });
    return;
  }

  const isOwner = group.members.some(
    (m) => m.userId === auth.userId && m.role === "owner",
  );
  if (!isOwner) {
    res.status(403).json({
      ok: false,
      error: "forbidden",
      message: "Only the owner can rotate the invite code",
    });
    return;
  }

  let newCode = "";
  let persisted = false;

  db.mutate((draft) => {
    const gidx = draft.familyGroups.findIndex((g) => g.id === gid);
    if (gidx < 0) return;
    newCode = generateUniqueInviteCode(draft, gid);
    draft.familyGroups[gidx]!.inviteCode = newCode;
    persisted = true;
  });

  if (!persisted || !newCode) {
    console.log(
      "[family/invite/rotate] persist_failed",
      JSON.stringify({ userId: auth.userId, familyId: gid }),
    );
    res.status(500).json({
      ok: false,
      error: "persist_failed",
      message: "Failed to update invite code",
    });
    return;
  }

  // Confirm the write is visible on the next read.
  const after = db.read().familyGroups.find((g) => g.id === gid);
  console.log(
    "[family/invite/rotate]",
    JSON.stringify({
      userId: auth.userId,
      familyId: gid,
      previous: normalizeInviteCode(group.inviteCode),
      newCode,
      storedAfter: after?.inviteCode ?? null,
      match: after ? normalizeInviteCode(after.inviteCode) === newCode : false,
    }),
  );

  res.json({ ok: true, inviteCode: newCode });
}

familyRouter.post("/family/invite/rotate", handleRotateInvite);
familyRouter.post("/v1/family/invite_code/regenerate", handleRotateInvite);
