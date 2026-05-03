import crypto from "crypto";
import express, { Request, Response, Router } from "express";
import type { MyframeDb } from "../db/store";
import { db } from "../db/store";
import { verifyUserJwtBearer } from "../services/app_user_jwt";

export const familyRouter = Router();

familyRouter.use(express.json({ limit: "64kb" }));

function authUser(req: Request, res: Response): { userId: string } | null {
  const u = verifyUserJwtBearer(req);
  if (!u) {
    res.status(401).json({ ok: false, error: "unauthorized", message: "Missing or invalid token" });
    return null;
  }
  return { userId: u.userId };
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

/** Remove user from their current group only (used by DELETE /leave). */
function leaveUserCurrentFamily(draft: MyframeDb, userId: string): void {
  const uidx = draft.users.findIndex((u) => u.id === userId);
  if (uidx < 0) return;
  const gid = draft.users[uidx]!.familyGroupId;
  if (!gid) return;
  const gidx = draft.familyGroups.findIndex((g) => g.id === gid);
  if (gidx >= 0) {
    draft.familyGroups[gidx]!.members = draft.familyGroups[gidx]!.members.filter((m) => m.userId !== userId);
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
    inviteCode = generateInviteCode();

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
    }
  });

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

  const inviteCodeRaw = String(req.body?.inviteCode ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (inviteCodeRaw.length !== 8) {
    res.status(400).json({ ok: false, error: "invalid_invite", message: "Invite code must be 8 characters" });
    return;
  }

  const snapshot = db.read();
  const targetGroup = snapshot.familyGroups.find((fg) => fg.inviteCode === inviteCodeRaw);
  if (!targetGroup) {
    res.status(404).json({ ok: false, error: "not_found", message: "No family matches that invite code" });
    return;
  }

  const targetId = targetGroup.id;

  db.mutate((draft) => {
    detachUserFromFamily(draft, auth.userId);

    const gidx = draft.familyGroups.findIndex((g) => g.id === targetId);
    if (gidx < 0) return;
    const has = draft.familyGroups[gidx]!.members.some((m) => m.userId === auth.userId);
    if (!has) {
      draft.familyGroups[gidx]!.members.push({ userId: auth.userId, role: "member" });
    }

    const uidx = draft.users.findIndex((u) => u.id === auth.userId);
    if (uidx >= 0) {
      draft.users[uidx] = {
        ...draft.users[uidx]!,
        familyGroupId: targetId,
      };
    }
  });

  res.json({ ok: true, familyId: targetId });
});

/** GET /api/family/members */
familyRouter.get("/family/members", (_req, res) => {
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
    inviteCode: group.inviteCode,
    members,
  });
});

/** DELETE /api/family/leave */
familyRouter.delete("/family/leave", (req, res) => {
  const auth = authUser(req, res);
  if (!auth) return;

  db.mutate((draft) => {
    leaveUserCurrentFamily(draft, auth.userId);
  });

  res.json({ ok: true });
});

/** POST /api/family/invite/rotate */
familyRouter.post("/family/invite/rotate", (_req, res) => {
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

  const isOwner = group.members.some((m) => m.userId === auth.userId && m.role === "owner");
  if (!isOwner) {
    res.status(403).json({ ok: false, error: "forbidden", message: "Only the owner can rotate the invite code" });
    return;
  }

  const newCode = generateInviteCode();

  db.mutate((draft) => {
    const gidx = draft.familyGroups.findIndex((g) => g.id === gid);
    if (gidx >= 0) {
      draft.familyGroups[gidx]!.inviteCode = newCode;
    }
  });

  res.json({ ok: true, inviteCode: newCode });
});
