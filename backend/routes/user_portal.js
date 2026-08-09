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
exports.userPortalRouter = void 0;
const express_1 = __importStar(require("express"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const multer_1 = __importDefault(require("multer"));
const store_1 = require("../db/store");
const app_user_jwt_1 = require("../services/app_user_jwt");
const slideshow_stop_1 = require("../services/slideshow_stop");
exports.userPortalRouter = (0, express_1.Router)();
exports.userPortalRouter.use(express_1.default.json({ limit: "256kb" }));
function authUser(req, res) {
    const u = (0, app_user_jwt_1.verifyUserJwtBearer)(req);
    if (!u) {
        res.status(401).json({ ok: false, error: "unauthorized" });
        return null;
    }
    return u;
}
function normalizeBleKey(bleMac) {
    return bleMac.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
}
function visibleFrameIdsForUser(userId) {
    const data = store_1.db.read();
    const user = data.users.find((x) => x.id === userId);
    const ids = new Set();
    for (const f of data.frames) {
        if (f.ownerUserId === userId)
            ids.add(f.id);
        if (f.sharedToUserIds?.includes(userId))
            ids.add(f.id);
    }
    if (user?.familyGroupId) {
        const g = data.familyGroups.find((fg) => fg.id === user.familyGroupId);
        if (g) {
            for (const fid of g.frameIds)
                ids.add(fid);
        }
    }
    return [...ids];
}
function playlistEditableByUser(plId, userId) {
    const data = store_1.db.read();
    const vis = new Set(visibleFrameIdsForUser(userId));
    const pl = data.playlists.find((p) => p.id === plId);
    if (!pl || pl.system)
        return false;
    // Account gallery albums are owned by the creating user (may have no frames).
    if (pl.ownerUserId && pl.ownerUserId === userId)
        return true;
    if (!pl.assignedFrameIds.length && !pl.ownerUserId) {
        // Legacy orphan albums: allow the requesting user to claim/edit.
        return true;
    }
    return pl.assignedFrameIds.some((fid) => vis.has(fid));
}
/** GET /api/frames — frames accessible to the authenticated user (own + shared + family). */
exports.userPortalRouter.get("/frames", (req, res) => {
    const auth = authUser(req, res);
    if (!auth)
        return;
    const data = store_1.db.read();
    const user = data.users.find((u) => u.id === auth.userId);
    const ids = new Set();
    for (const f of data.frames) {
        if (f.ownerUserId === auth.userId)
            ids.add(f.id);
        if (Array.isArray(f.sharedToUserIds) && f.sharedToUserIds.includes(auth.userId))
            ids.add(f.id);
    }
    if (user?.familyGroupId) {
        const g = data.familyGroups.find((fg) => fg.id === user.familyGroupId);
        if (g)
            for (const fid of g.frameIds)
                ids.add(fid);
    }
    const frames = data.frames
        .filter((f) => ids.has(f.id))
        .map((f) => ({
        id: f.id,
        bleMac: f.bleMac,
        name: f.id,
        wifiSsid: f.wifiSsid,
        wifiStatus: f.wifiStatus,
        firmwareVersion: f.firmwareVersion,
        lastSeenAtMs: f.lastSeenAtMs,
        uptimeMs: f.uptimeMs,
        familyId: user?.familyGroupId ?? null,
    }));
    res.json({ ok: true, frames });
});
/** GET /api/user/dashboard */
exports.userPortalRouter.get("/user/dashboard", (req, res) => {
    const auth = authUser(req, res);
    if (!auth)
        return;
    const data = store_1.db.read();
    const user = data.users.find((u) => u.id === auth.userId);
    if (!user) {
        res.status(404).json({ ok: false, error: "user_not_found" });
        return;
    }
    const frameIds = visibleFrameIdsForUser(auth.userId);
    const frames = data.frames.filter((f) => frameIds.includes(f.id));
    const now = Date.now();
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const msStart = monthStart.getTime();
    const uploadsOnFrames = data.uploads
        .filter((u) => frameIds.includes(u.deviceId))
        .sort((a, b) => b.atMs - a.atMs);
    const photosThisMonth = uploadsOnFrames.filter((u) => u.atMs >= msStart).length;
    const lastPhotoAtMsByFrame = new Map();
    for (const u of uploadsOnFrames) {
        if (!lastPhotoAtMsByFrame.has(u.deviceId))
            lastPhotoAtMsByFrame.set(u.deviceId, u.atMs);
    }
    let onlineDevices = 0;
    const deviceRows = frames.map((f) => {
        const HEARTBEAT_TIMEOUT = 30 * 60 * 1000; // align with MQTT grace (3× ~10min heart)
        const online = f.wifiStatus !== "never_provisioned" && f.lastSeenAtMs != null && (Date.now() - f.lastSeenAtMs) < HEARTBEAT_TIMEOUT;
        if (online)
            onlineDevices += 1;
        const macKey = normalizeBleKey(f.bleMac);
        const slideshow = data.slideshowsByBleMac?.[macKey];
        return {
            id: f.id,
            bleMac: f.bleMac,
            name: f.id,
            wifiStatus: f.wifiStatus,
            online,
            lastSeenAtMs: f.lastSeenAtMs,
            lastPhotoAtMs: lastPhotoAtMsByFrame.get(f.id) ?? null,
            firmwareVersion: f.firmwareVersion,
            slideshowIntervalMinutes: slideshow?.intervalMinutes ?? data.settings.preferences.autoRotateMinutes ?? 10,
            slideshowImageCount: slideshow?.imageIds?.length ?? 0,
            batteryPct: null,
        };
    });
    const aiSeen = new Set();
    for (const e of data.auditLog) {
        const aiish = /ai/i.test(String(e.action));
        if (!aiish && !/ai_generated/i.test(String(e.action)))
            continue;
        if (e.actor !== user.email && e.actor !== user.id && !String(e.target).includes(user.id))
            continue;
        aiSeen.add(e.id);
    }
    const aiGen = aiSeen.size;
    const familyGroup = user.familyGroupId
        ? data.familyGroups.find((g) => g.id === user.familyGroupId)
        : null;
    const memberRows = familyGroup?.members.map((m) => {
        const mu = data.users.find((x) => x.id === m.userId);
        const roleLabel = m.role === "owner" ? "Owner" : String(m.role).toLowerCase() === "admin" ? "Admin" : "Member";
        return {
            userId: m.userId,
            name: mu?.name ?? m.userId,
            email: mu?.email ?? "",
            role: roleLabel,
            isSelf: m.userId === user.id,
        };
    }) ?? [];
    const recentPhotos = uploadsOnFrames.slice(0, 24).map((u) => ({
        id: u.id,
        filename: u.filename,
        atMs: u.atMs,
        deviceId: u.deviceId,
        thumbUrl: `/frame-media/${encodeURIComponent(u.filename)}`,
    }));
    const aiPhotos = uploadsOnFrames
        .filter((u) => String(u.deliveryMode ?? "").toLowerCase().includes("ai"))
        .slice(0, 12)
        .map((u) => ({
        id: u.id,
        filename: u.filename,
        thumbUrl: `/frame-media/${encodeURIComponent(u.filename)}`,
    }));
    const activity = [];
    for (const u of uploadsOnFrames.slice(0, 12)) {
        activity.push({
            id: `up_${u.id}`,
            kind: "photo",
            label: `Photo sent to ${u.deviceId}`,
            atMs: u.atMs,
        });
    }
    for (const e of data.auditLog) {
        const rel = e.actor === user.email ||
            e.actor === user.id ||
            e.target === user.id ||
            frameIds.some((fid) => e.target.includes(fid));
        if (!rel)
            continue;
        activity.push({
            id: e.id,
            kind: String(e.action),
            label: `${e.action}: ${e.target}`,
            atMs: e.atMs,
        });
    }
    activity.sort((a, b) => b.atMs - a.atMs);
    const playlists = data.playlists.filter((p) => p.assignedFrameIds.some((fid) => frameIds.includes(fid)));
    res.json({
        ok: true,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            subscriptionTier: user.subscriptionTier,
            roleLabel: familyGroup?.members.find((m) => m.userId === user.id)?.role === "owner" ? "Owner" : "Member",
        },
        stats: {
            activeDevices: frames.length,
            onlineDevices,
            familyMembers: memberRows.length || 1,
            photosThisMonth,
            aiGenerated: aiGen,
        },
        devices: deviceRows,
        recentPhotos,
        aiPhotos,
        familyMembers: memberRows,
        activity: activity.slice(0, 25),
        playlists: playlists.map((p) => ({
            id: p.id,
            title: p.title,
            photoIds: p.photoIds,
            scheduleRule: p.scheduleRule,
            assignedFrameIds: p.assignedFrameIds,
            system: p.system,
        })),
        integrations: data.settings.integrations,
        preferences: data.settings.preferences,
        account: data.settings.account,
        familyInviteCode: familyGroup?.inviteCode ?? null,
    });
});
/** GET /api/user/gallery — user's photo history (newest first, max 200). */
exports.userPortalRouter.get("/user/gallery", (req, res) => {
    const auth = authUser(req, res);
    if (!auth)
        return;
    const data = store_1.db.read();
    // Match by uploader OR by visible frame MAC/id (uploads store STA MAC, frames may use id/bleMac).
    const visible = data.frames.filter((f) => visibleFrameIdsForUser(auth.userId).includes(f.id));
    const macKeys = new Set();
    for (const f of visible) {
        for (const raw of [f.id, f.bleMac, f.stationMac ?? ""]) {
            const hex = String(raw).replace(/[^a-fA-F0-9]/g, "").toUpperCase();
            if (hex.length >= 12) {
                const n = hex.length === 12 ? hex : hex.slice(-12);
                macKeys.add(n);
                try {
                    const v = BigInt("0x" + n);
                    macKeys.add((v - 2n).toString(16).toUpperCase().padStart(12, "0"));
                    macKeys.add((v + 2n).toString(16).toUpperCase().padStart(12, "0"));
                }
                catch { /* ignore */ }
            }
            macKeys.add(String(raw));
        }
    }
    const photos = data.uploads
        .filter((u) => {
        if (u.uploaderUserId === auth.userId)
            return true;
        const d = String(u.deviceId || "");
        const hex = d.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
        const n = hex.length >= 12 ? (hex.length === 12 ? hex : hex.slice(-12)) : "";
        return macKeys.has(d) || (n && macKeys.has(n));
    })
        .sort((a, b) => b.atMs - a.atMs)
        .slice(0, 200)
        .map((u) => {
        const path = u.previewFilename
            ? `/frame-media/${encodeURIComponent(u.previewFilename)}`
            : `/frame-media/${encodeURIComponent(u.filename)}`;
        const base = String(process.env.PUBLIC_MEDIA_BASE_URL || process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
        return {
            id: u.id,
            url: base ? `${base}${path}` : path,
            atMs: u.atMs,
            deviceId: u.deviceId,
            filename: u.filename,
        };
    });
    res.json({ ok: true, photos });
});
/** PATCH /api/user/playlists/:id */
exports.userPortalRouter.patch("/user/playlists/:id", (req, res) => {
    const auth = authUser(req, res);
    if (!auth)
        return;
    const id = String(req.params.id);
    if (!playlistEditableByUser(id, auth.userId)) {
        res.status(403).json({ ok: false, error: "playlist_not_editable" });
        return;
    }
    const title = req.body?.title != null ? String(req.body.title).trim() : undefined;
    const scheduleRule = req.body?.scheduleRule !== undefined ? (req.body.scheduleRule === null ? null : String(req.body.scheduleRule)) : undefined;
    const photoIds = Array.isArray(req.body?.photoIds) ? req.body.photoIds.map((x) => String(x)) : undefined;
    const assignedFrameId = req.body?.assignedFrameId != null
        ? String(req.body.assignedFrameId).trim()
        : undefined;
    const assignedFrameIds = Array.isArray(req.body?.assignedFrameIds)
        ? req.body.assignedFrameIds.map((x) => String(x).trim()).filter(Boolean)
        : undefined;
    let updated = false;
    const next = store_1.db.mutate((draft) => {
        draft.playlists = draft.playlists.map((p) => {
            if (p.id !== id)
                return p;
            updated = true;
            let nextAssigned = p.assignedFrameIds;
            if (assignedFrameIds !== undefined) {
                nextAssigned = assignedFrameIds;
            }
            else if (assignedFrameId !== undefined && assignedFrameId.length > 0) {
                const set = new Set(p.assignedFrameIds || []);
                set.add(assignedFrameId);
                nextAssigned = [...set];
            }
            return {
                ...p,
                ...(title !== undefined && title.length > 0 ? { title } : {}),
                ...(scheduleRule !== undefined ? { scheduleRule } : {}),
                ...(photoIds !== undefined ? { photoIds } : {}),
                assignedFrameIds: nextAssigned,
                ...(p.ownerUserId ? {} : { ownerUserId: auth.userId }),
            };
        });
        const u = draft.users.find((x) => x.id === auth.userId);
        if (u) {
            u.syncVersion = (u.syncVersion ?? 0) + 1;
            u.syncUpdatedAtMs = Date.now();
        }
    });
    if (!updated) {
        res.status(404).json({ ok: false, error: "playlist_not_found" });
        return;
    }
    const pl = next.playlists.find((p) => p.id === id);
    res.json({ ok: true, playlist: pl });
});
/** POST /api/user/gallery — account gallery sync (NO cast to frame). */
const galleryUploadDir = path_1.default.resolve(process.cwd(), process.env.UPLOAD_DIR || "uploads");
if (!fs_1.default.existsSync(galleryUploadDir)) {
    fs_1.default.mkdirSync(galleryUploadDir, { recursive: true });
}
const galleryUpload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: (_req, _file, cb) => cb(null, galleryUploadDir),
        filename: (_req, file, cb) => {
            const safe = String(file.originalname || "photo.jpg").replace(/[^\w.\-]+/g, "_");
            cb(null, `gallery_${Date.now()}_${safe}`);
        },
    }),
    limits: { fileSize: 20 * 1024 * 1024 },
});
exports.userPortalRouter.post("/user/gallery", galleryUpload.single("file"), (req, res) => {
    const auth = authUser(req, res);
    if (!auth)
        return;
    const file = req.file;
    if (!file) {
        res.status(400).json({ ok: false, error: "missing_file" });
        return;
    }
    const now = Date.now();
    const uploadId = `gal_${now}_${Math.random().toString(16).slice(2, 10)}`;
    const deviceId = String(req.body?.device_id ?? "").trim() || null;
    const filename = path_1.default.basename(file.filename || "photo.jpg");
    store_1.db.mutate((draft) => {
        draft.uploads.unshift({
            id: uploadId,
            filename,
            previewFilename: filename,
            bytes: file.size || 0,
            deviceId: deviceId || "gallery",
            atMs: now,
            checksumSha256: "",
            deliveredToFrame: false,
            deliveryMode: "gallery_sync",
            deliveryCheckedAtMs: now,
            uploaderUserId: auth.userId,
        });
        if (draft.uploads.length > 2000) {
            draft.uploads = draft.uploads.slice(0, 2000);
        }
        const u = draft.users.find((x) => x.id === auth.userId);
        if (u) {
            u.syncVersion = (u.syncVersion ?? 0) + 1;
            u.syncUpdatedAtMs = Date.now();
        }
    });
    const mediaBase = String(process.env.PUBLIC_MEDIA_BASE_URL || process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
    const rel = `/frame-media/${encodeURIComponent(filename)}`;
    res.json({
        ok: true,
        id: uploadId,
        photo_id: uploadId,
        url: mediaBase ? `${mediaBase}${rel}` : rel,
        atMs: now,
    });
});
/** POST /api/user/playlists — create album/playlist for account sync. */
exports.userPortalRouter.post("/user/playlists", (req, res) => {
    const auth = authUser(req, res);
    if (!auth)
        return;
    const title = String(req.body?.title ?? req.body?.name ?? "Album").trim() || "Album";
    const assignedFrameId = String(req.body?.assignedFrameId ?? "").trim();
    const id = `pl_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const playlist = {
        id,
        title,
        photoIds: [],
        scheduleRule: null,
        assignedFrameIds: assignedFrameId ? [assignedFrameId] : [],
        system: false,
        ownerUserId: auth.userId,
    };
    store_1.db.mutate((draft) => {
        draft.playlists.push(playlist);
        const u = draft.users.find((x) => x.id === auth.userId);
        if (u) {
            u.syncVersion = (u.syncVersion ?? 0) + 1;
            u.syncUpdatedAtMs = Date.now();
        }
    });
    res.json({ ok: true, playlist });
});
/** GET /api/v1/user/albums — album list for Flutter AlbumCloudSync. */
/**
 * Account deletes + frame stop (client requirement).
 * Playlist/album DELETE syncs cloud state AND notifies frames playing that
 * content to stop (clear slideshowsByBleMac + MQTT stop/strategy idle).
 */
function bumpUserSync(draft, userId) {
    const u = draft.users.find((x) => x.id === userId);
    if (u) {
        u.syncVersion = (u.syncVersion ?? 0) + 1;
        u.syncUpdatedAtMs = Date.now();
    }
}
function userOwnsUpload(uploadId, userId) {
    const data = store_1.db.read();
    const u = data.uploads.find((x) => x.id === uploadId);
    return !!(u && u.uploaderUserId === userId);
}
async function deleteOwnedUpload(authUserId, uploadId) {
    const id = String(uploadId || "").trim();
    if (!id)
        return { ok: false, error: "missing_id" };
    if (!userOwnsUpload(id, authUserId)) {
        const data = store_1.db.read();
        if (!data.uploads.some((x) => x.id === id))
            return { ok: false, error: "not_found" };
        return { ok: false, error: "forbidden" };
    }
    let filename = null;
    let preview = null;
    let deliveryMode = "";
    store_1.db.mutate((draft) => {
        const match = draft.uploads.find((x) => x.id === id);
        if (!match || match.uploaderUserId !== authUserId)
            return;
        filename = match.filename || null;
        preview = match.previewFilename || null;
        deliveryMode = String(match.deliveryMode || "");
        draft.uploads = draft.uploads.filter((x) => x.id !== id);
        // Account album membership only — never mutate live frame slideshows / MQTT.
        // Single Recent-photo delete must not stop or replace an active playlist.
        for (const pl of draft.playlists) {
            if (!Array.isArray(pl.photoIds) || !pl.photoIds.includes(id))
                continue;
            if (pl.ownerUserId && pl.ownerUserId !== authUserId)
                continue;
            pl.photoIds = pl.photoIds.filter((pid) => pid !== id);
        }
        bumpUserSync(draft, authUserId);
    });
    // Only unlink account-gallery JPEGs. Frame cast `.bin` files may still be
    // referenced by an active hardware slideshow — leave them on disk.
    const isGalleryOnly = deliveryMode === "gallery_sync" ||
        id.startsWith("gal_") ||
        (filename != null && String(filename).startsWith("gallery_"));
    if (isGalleryOnly) {
        for (const name of [filename, preview]) {
            if (!name)
                continue;
            try {
                const p = path_1.default.join(galleryUploadDir, path_1.default.basename(name));
                if (fs_1.default.existsSync(p))
                    fs_1.default.unlinkSync(p);
            }
            catch { /* ignore */ }
        }
    }
    return { ok: true };
}
async function deleteOwnedPlaylist(authUserId, playlistId) {
    const id = String(playlistId || "").trim();
    if (!id)
        return { ok: false, error: "missing_id" };
    if (!playlistEditableByUser(id, authUserId)) {
        const data = store_1.db.read();
        if (!data.playlists.some((p) => p.id === id))
            return { ok: false, error: "not_found" };
        return { ok: false, error: "forbidden" };
    }
    const before = store_1.db.read().playlists.find((p) => p.id === id);
    if (!before)
        return { ok: false, error: "not_found" };
    const snapshot = {
        photoIds: Array.isArray(before.photoIds) ? [...before.photoIds] : [],
        assignedFrameIds: Array.isArray(before.assignedFrameIds) ? [...before.assignedFrameIds] : [],
        ownerUserId: before.ownerUserId || authUserId,
    };
    const stopResult = await (0, slideshow_stop_1.stopPlaybackForDeletedPlaylist)(snapshot).catch((err) => {
        console.warn("[user_portal] stopPlaybackForDeletedPlaylist", err);
        return {
            cleared: [],
            notified: [],
            fallbackUrls: {},
        };
    });
    let removed = false;
    store_1.db.mutate((draft) => {
        const n = draft.playlists.length;
        draft.playlists = draft.playlists.filter((p) => p.id !== id);
        removed = draft.playlists.length < n;
        if (removed)
            bumpUserSync(draft, authUserId);
    });
    if (!removed)
        return { ok: false, error: "not_found" };
    return {
        ok: true,
        framesCleared: stopResult.cleared,
        framesNotified: stopResult.notified,
        fallbackUrls: stopResult.fallbackUrls,
    };
}
/** DELETE /api/user/gallery/:id */
exports.userPortalRouter.delete("/user/gallery/:id", (req, res) => {
    const auth = authUser(req, res);
    if (!auth)
        return;
    void deleteOwnedUpload(auth.userId, String(req.params.id)).then((result) => {
        if (!result.ok) {
            const code = result.error === "forbidden" ? 403 : 404;
            res.status(code).json({ ok: false, error: result.error || "delete_failed" });
            return;
        }
        res.json({ ok: true });
    });
});
/** DELETE /api/v1/user/media/:id */
exports.userPortalRouter.delete("/v1/user/media/:id", (req, res) => {
    const auth = authUser(req, res);
    if (!auth)
        return;
    void deleteOwnedUpload(auth.userId, String(req.params.id)).then((result) => {
        if (!result.ok) {
            const code = result.error === "forbidden" ? 403 : 404;
            res.status(code).json({ ok: false, error: result.error || "delete_failed" });
            return;
        }
        res.json({ ok: true });
    });
});
/** DELETE /api/user/playlists/:id — sync + notify frames to stop. */
exports.userPortalRouter.delete("/user/playlists/:id", (req, res) => {
    const auth = authUser(req, res);
    if (!auth)
        return;
    void deleteOwnedPlaylist(auth.userId, String(req.params.id)).then((result) => {
        if (!result.ok) {
            const code = result.error === "forbidden" ? 403 : 404;
            res.status(code).json({ ok: false, error: result.error || "delete_failed" });
            return;
        }
        res.json({
            ok: true,
            framesCleared: result.framesCleared || [],
            framesNotified: result.framesNotified || [],
            fallbackUrls: result.fallbackUrls || {},
        });
    });
});
/** DELETE /api/v1/user/albums/:id — sync + notify frames to stop. */
exports.userPortalRouter.delete("/v1/user/albums/:id", (req, res) => {
    const auth = authUser(req, res);
    if (!auth)
        return;
    void deleteOwnedPlaylist(auth.userId, String(req.params.id)).then((result) => {
        if (!result.ok) {
            const code = result.error === "forbidden" ? 403 : 404;
            res.status(code).json({ ok: false, error: result.error || "delete_failed" });
            return;
        }
        res.json({
            ok: true,
            framesCleared: result.framesCleared || [],
            framesNotified: result.framesNotified || [],
            fallbackUrls: result.fallbackUrls || {},
        });
    });
});
exports.userPortalRouter.get("/v1/user/albums", (req, res) => {
    const auth = authUser(req, res);
    if (!auth)
        return;
    const data = store_1.db.read();
    const albums = data.playlists
        .filter((p) => {
        if (p.system)
            return false;
        if (p.ownerUserId)
            return p.ownerUserId === auth.userId;
        // Legacy: include unowned playlists assigned to this user's frames, or orphans.
        const vis = new Set(visibleFrameIdsForUser(auth.userId));
        if (p.assignedFrameIds.some((fid) => vis.has(fid)))
            return true;
        return !p.assignedFrameIds.length;
    })
        .map((p) => ({
        id: p.id,
        name: p.title,
        title: p.title,
        photo_ids: Array.isArray(p.photoIds) ? p.photoIds : [],
        photoIds: Array.isArray(p.photoIds) ? p.photoIds : [],
        photo_count: Array.isArray(p.photoIds) ? p.photoIds.length : 0,
        frame_ids: Array.isArray(p.assignedFrameIds) ? p.assignedFrameIds : [],
    }));
    res.json({ ok: true, albums });
});
