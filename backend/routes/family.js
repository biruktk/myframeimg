"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.familyRouter = void 0;
exports.normalizeInviteCode = normalizeInviteCode;
const crypto_1 = __importDefault(require("crypto"));
const express_1 = __importStar(require("express"));
const store_1 = require("../db/store");
const app_user_jwt_1 = require("../services/app_user_jwt");
exports.familyRouter = (0, express_1.Router)();
exports.familyRouter.use(express_1.default.json({ limit: "64kb" }));
function authUser(req, res) {
    const u = (0, app_user_jwt_1.verifyUserJwtBearer)(req);
    if (!u) {
        res.status(401).json({ ok: false, error: "unauthorized", message: "Missing or invalid token" });
        return null;
    }
    return { userId: u.userId };
}
/** Canonical invite form: NFKC → trim → upper → strip spaces/hyphens. */
function normalizeInviteCode(raw) {
    return String(raw ?? "")
        .normalize("NFKC")
        .trim()
        .toUpperCase()
        .replace(/[\s\-]+/g, "");
}
function generateInviteCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto_1.default.randomBytes(8);
    let s = "";
    for (let i = 0; i < 8; i++) {
        s += alphabet[bytes[i] % alphabet.length];
    }
    return s;
}
function generateUniqueInviteCode(draft, excludeGroupId) {
    for (let attempt = 0; attempt < 24; attempt++) {
        const code = generateInviteCode();
        const taken = draft.familyGroups.some((g) => g.id !== excludeGroupId &&
            normalizeInviteCode(g.inviteCode) === code);
        if (!taken)
            return code;
    }
    // Extremely unlikely; still return a fresh code.
    return generateInviteCode();
}
function findFamilyByInviteCode(groups, inputCode) {
    const want = normalizeInviteCode(inputCode);
    if (!want)
        return undefined;
    return groups.find((fg) => normalizeInviteCode(fg.inviteCode) === want);
}
function codeDebug(label, value) {
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
function leaveUserCurrentFamily(draft, userId) {
    const uidx = draft.users.findIndex((u) => u.id === userId);
    if (uidx < 0)
        return;
    const gid = draft.users[uidx].familyGroupId;
    if (!gid)
        return;
    const gidx = draft.familyGroups.findIndex((g) => g.id === gid);
    if (gidx >= 0) {
        draft.familyGroups[gidx].members = draft.familyGroups[gidx].members.filter((m) => m.userId !== userId);
        if (draft.familyGroups[gidx].members.length === 0) {
            draft.familyGroups.splice(gidx, 1);
        }
    }
    draft.users[uidx] = {
        ...draft.users[uidx],
        familyGroupId: null,
    };
}
/** Remove user from any family group and clear [users.familyGroupId]. Drops empty groups. */
function detachUserFromFamily(draft, userId) {
    for (const g of draft.familyGroups) {
        g.members = g.members.filter((m) => m.userId !== userId);
    }
    draft.familyGroups = draft.familyGroups.filter((g) => g.members.length > 0);
    const uidx = draft.users.findIndex((u) => u.id === userId);
    if (uidx >= 0) {
        draft.users[uidx] = {
            ...draft.users[uidx],
            familyGroupId: null,
        };
    }
}
/** POST /api/family/create */
exports.familyRouter.post("/family/create", (req, res) => {
    const auth = authUser(req, res);
    if (!auth)
        return;
    const name = String(req.body?.name ?? "Our family").trim() || "Our family";
    let newId = "";
    let inviteCode = "";
    store_1.db.mutate((draft) => {
        detachUserFromFamily(draft, auth.userId);
        newId = `fam_${Date.now()}_${crypto_1.default.randomBytes(3).toString("hex")}`;
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
                ...draft.users[uidx],
                familyGroupId: newId,
            };
        }
    });
    console.log("[family/create]", JSON.stringify({ userId: auth.userId, familyId: newId, inviteCode }));
    res.status(201).json({
        ok: true,
        familyId: newId,
        inviteCode,
    });
});
/** POST /api/family/join */
exports.familyRouter.post("/family/join", (req, res) => {
    const auth = authUser(req, res);
    if (!auth)
        return;
    const inviteRaw = req.body?.inviteCode ?? req.body?.code ?? "";
    const inviteCodeNorm = normalizeInviteCode(inviteRaw);
    if (inviteCodeNorm.length !== 8) {
        console.log("[family/join] invalid_length", JSON.stringify({
            userId: auth.userId,
            ...codeDebug("received", inviteRaw),
        }));
        res.status(400).json({
            ok: false,
            error: "invalid_invite",
            message: "Invite code must be 8 characters",
        });
        return;
    }
    const snapshot = store_1.db.read();
    const storedCodes = snapshot.familyGroups.map((fg) => ({
        id: fg.id,
        ...codeDebug("stored", fg.inviteCode),
    }));
    console.log("[family/join] verify", JSON.stringify({
        userId: auth.userId,
        ...codeDebug("received", inviteRaw),
        storedCodes,
    }));
    const targetGroup = findFamilyByInviteCode(snapshot.familyGroups, inviteCodeNorm);
    if (!targetGroup) {
        console.log("[family/join] not_found", JSON.stringify({
            userId: auth.userId,
            want: inviteCodeNorm,
            available: storedCodes.map((c) => c.norm),
        }));
        res.status(404).json({
            ok: false,
            error: "not_found",
            message: "No family matches that invite code",
        });
        return;
    }
    const alreadyMember = targetGroup.members.some((m) => m.userId === auth.userId) ||
        snapshot.users.find((u) => u.id === auth.userId)?.familyGroupId ===
            targetGroup.id;
    if (alreadyMember) {
        console.log("[family/join] already_member", JSON.stringify({
            userId: auth.userId,
            familyId: targetGroup.id,
            inviteCode: normalizeInviteCode(targetGroup.inviteCode),
        }));
        res.status(409).json({
            ok: false,
            error: "already_member",
            message: "You are already a member of this family.",
            familyId: targetGroup.id,
        });
        return;
    }
    const targetId = targetGroup.id;
    store_1.db.mutate((draft) => {
        // Leave any other family first (never detach from target — already checked).
        detachUserFromFamily(draft, auth.userId);
        const gidx = draft.familyGroups.findIndex((g) => g.id === targetId);
        if (gidx < 0)
            return;
        const has = draft.familyGroups[gidx].members.some((m) => m.userId === auth.userId);
        if (!has) {
            draft.familyGroups[gidx].members.push({
                userId: auth.userId,
                role: "member",
            });
        }
        // Re-normalize stored code so future lookups stay consistent.
        draft.familyGroups[gidx].inviteCode = normalizeInviteCode(draft.familyGroups[gidx].inviteCode);
        const uidx = draft.users.findIndex((u) => u.id === auth.userId);
        if (uidx >= 0) {
            draft.users[uidx] = {
                ...draft.users[uidx],
                familyGroupId: targetId,
            };
        }
    });
    console.log("[family/join] ok", JSON.stringify({ userId: auth.userId, familyId: targetId, inviteCode: inviteCodeNorm }));
    res.json({ ok: true, familyId: targetId });
});
/** GET /api/family/members */
exports.familyRouter.get("/family/members", (_req, res) => {
    const auth = authUser(_req, res);
    if (!auth)
        return;
    const data = store_1.db.read();
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
            avatar: null,
            role: m.role,
        };
    });
    res.json({
        ok: true,
        familyId: group.id,
        familyName: group.name,
        inviteCode: normalizeInviteCode(group.inviteCode) || group.inviteCode,
        members,
    });
});
/** DELETE /api/family/leave */
exports.familyRouter.delete("/family/leave", (req, res) => {
    const auth = authUser(req, res);
    if (!auth)
        return;
    store_1.db.mutate((draft) => {
        leaveUserCurrentFamily(draft, auth.userId);
    });
    res.json({ ok: true });
});
/** POST /api/family/invite/rotate — persists a new code immediately. */
exports.familyRouter.post("/family/invite/rotate", (_req, res) => {
    const auth = authUser(_req, res);
    if (!auth)
        return;
    const data = store_1.db.read();
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
        res.status(403).json({
            ok: false,
            error: "forbidden",
            message: "Only the owner can rotate the invite code",
        });
        return;
    }
    let newCode = "";
    let persisted = false;
    store_1.db.mutate((draft) => {
        const gidx = draft.familyGroups.findIndex((g) => g.id === gid);
        if (gidx < 0)
            return;
        newCode = generateUniqueInviteCode(draft, gid);
        draft.familyGroups[gidx].inviteCode = newCode;
        persisted = true;
    });
    if (!persisted || !newCode) {
        console.log("[family/invite/rotate] persist_failed", JSON.stringify({ userId: auth.userId, familyId: gid }));
        res.status(500).json({
            ok: false,
            error: "persist_failed",
            message: "Failed to update invite code",
        });
        return;
    }
    // Confirm the write is visible on the next read.
    const after = store_1.db.read().familyGroups.find((g) => g.id === gid);
    console.log("[family/invite/rotate]", JSON.stringify({
        userId: auth.userId,
        familyId: gid,
        previous: normalizeInviteCode(group.inviteCode),
        newCode,
        storedAfter: after?.inviteCode ?? null,
        match: after ? normalizeInviteCode(after.inviteCode) === newCode : false,
    }));
    res.json({ ok: true, inviteCode: newCode });
});
