"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userProfileRouter = void 0;
const express_1 = require("express");
const store_1 = require("../db/store");
const app_user_jwt_1 = require("../services/app_user_jwt");
const frame_mqtt_1 = require("../services/frame_mqtt");
const account_sync_state_1 = require("../services/account_sync_state");
exports.userProfileRouter = (0, express_1.Router)();
exports.userProfileRouter.use((req, res, next) => {
    // Only guard /api/v1/user/* — do NOT block other /api routes mounted later
    // (e.g. WeChat phone-login). Express runs this router for every /api request.
    if (!String(req.path || "").startsWith("/v1/user")) {
        next("router");
        return;
    }
    const user = (0, app_user_jwt_1.verifyUserJwtBearer)(req);
    if (!user) {
        res.status(401).json({ ok: false, error: "unauthorized" });
        return;
    }
    req._authedUser = user;
    next();
});
function authed(req) {
    return req._authedUser;
}
/** GET /api/v1/user/profile — light metadata only (no permanent media blobs). */
exports.userProfileRouter.get("/v1/user/profile", (req, res) => {
    const user = authed(req);
    const data = store_1.db.read();
    const account = data.users.find((u) => u.id === user.userId);
    if (!account) {
        res.status(404).json({ ok: false, error: "user_not_found" });
        return;
    }
    const boundFrames = (0, account_sync_state_1.visibleFramesForUser)(data, account.id);
    const persisted = account.syncConfigurations != null;
    const configs = account.syncConfigurations ?? {};
    const primaryFrameId = account.primaryFrameId ??
        (boundFrames[0] ? boundFrames[0].id : null);
    const pendingTransit = (data.syncTransitPackages ?? [])
        .filter((p) => p.userId === account.id && !p.consumedAtMs && p.expiresAtMs > Date.now())
        .map((p) => ({
        package_id: p.id,
        filename: p.filename,
        bytes: p.bytes,
        created_at: p.createdAtMs,
        expires_at: p.expiresAtMs,
        download_path: `/api/v1/sync/transit/${encodeURIComponent(p.id)}`,
    }));
    res.json({
        ok: true,
        account_id: account.id,
        sync_version: account.syncVersion ?? 0,
        sync_updated_at: account.syncUpdatedAtMs ?? account.lastSeenAtMs ?? 0,
        wechat_unionid: account.wechatUnionId ?? null,
        primary_frame_id: primaryFrameId,
        profile: {
            nickname: account.name || "User",
            email: account.email,
            phone: account.phone ?? null,
            role: account.familyGroupId ? "member" : "owner",
        },
        configurations_persisted: persisted,
        configurations: persisted
            ? {
                language: configs.language ?? null,
                theme: configs.theme ?? null,
                push_notifications_enabled: configs.push_notifications_enabled !== false,
                display_preferences: {
                    auto_slideshow: configs.display_preferences?.auto_slideshow !== false,
                    interval_seconds: Number(configs.display_preferences?.interval_seconds ?? 30),
                },
                primary_frame_id: primaryFrameId,
            }
            : null,
        bound_frames: boundFrames.map((f) => ({
            frame_id: f.id,
            frame_name: (0, account_sync_state_1.frameDisplayName)(f),
            ble_mac: (0, frame_mqtt_1.normalizeMac)(f.bleMac || f.stationMac || f.id),
            station_mac: f.stationMac ? (0, frame_mqtt_1.normalizeMac)(f.stationMac) : null,
            is_owner: f.ownerUserId === account.id,
            wifi_ssid: f.wifiSsid,
            online: f.wifiStatus === "online" && !!(f.wifiSsid && String(f.wifiSsid).trim()),
            last_seen_at: f.lastSeenAtMs,
            battery: f.battery ?? null,
        })),
        playlists_meta: (0, account_sync_state_1.playlistsMetaForUser)(data, account.id),
        pending_transit: pendingTransit,
        // Explicitly omit permanent user_uploads / gallery blobs (zero permanent media).
    });
});
/** PUT /api/v1/user/profile — update synced preferences / primary frame; bumps sync_version. */
exports.userProfileRouter.put("/v1/user/profile", (req, res) => {
    const user = authed(req);
    const body = req.body || {};
    const data = store_1.db.read();
    const idx = data.users.findIndex((u) => u.id === user.userId);
    if (idx === -1) {
        res.status(404).json({ ok: false, error: "user_not_found" });
        return;
    }
    const clientUpdatedAt = Number(body.client_updated_at ?? body.updated_at_ms ?? 0);
    const serverUpdatedAt = Number(data.users[idx]?.syncUpdatedAtMs ?? 0);
    if (clientUpdatedAt > 0 && serverUpdatedAt > 0 && clientUpdatedAt < serverUpdatedAt) {
        // Last-write-wins: ignore stale client push.
        res.json({
            ok: true,
            ignored: true,
            reason: "stale_client",
            sync_version: data.users[idx]?.syncVersion ?? 0,
            sync_updated_at: serverUpdatedAt,
        });
        return;
    }
    store_1.db.mutate((draft) => {
        const u = draft.users[idx];
        if (typeof body.nickname === "string" && body.nickname.trim()) {
            u.name = body.nickname.trim();
        }
        const nextConfigs = { ...(u.syncConfigurations ?? {}) };
        if (typeof body.language === "string")
            nextConfigs.language = body.language;
        if (typeof body.theme === "string")
            nextConfigs.theme = body.theme;
        if (typeof body.push_notifications_enabled === "boolean") {
            nextConfigs.push_notifications_enabled = body.push_notifications_enabled;
        }
        if (body.display_preferences && typeof body.display_preferences === "object") {
            nextConfigs.display_preferences = {
                ...(nextConfigs.display_preferences ?? {}),
                ...body.display_preferences,
            };
        }
        u.syncConfigurations = nextConfigs;
        if (typeof body.primary_frame_id === "string") {
            const pid = body.primary_frame_id.trim();
            u.primaryFrameId = pid.length ? pid : null;
        }
        // playlists_meta replace (structure only — photo IDs, no binaries)
        if (Array.isArray(body.playlists_meta)) {
            const visibleIds = new Set((0, account_sync_state_1.visibleFramesForUser)(draft, u.id).map((f) => f.id));
            for (const meta of body.playlists_meta) {
                if (!meta || typeof meta !== "object")
                    continue;
                const id = String(meta.id ?? "").trim();
                if (!id)
                    continue;
                const title = String(meta.name ?? meta.title ?? "Album").trim();
                const photoIds = Array.isArray(meta.photo_ids)
                    ? meta.photo_ids.map(String)
                    : [];
                const assigned = Array.isArray(meta.frame_ids)
                    ? meta.frame_ids.map(String).filter((fid) => visibleIds.has(fid) || visibleIds.size === 0)
                    : [];
                const plIdx = draft.playlists.findIndex((p) => p.id === id);
                if (plIdx >= 0) {
                    const pl = draft.playlists[plIdx];
                    if (!pl.system) {
                        pl.title = title || pl.title;
                        pl.photoIds = photoIds;
                        if (assigned.length)
                            pl.assignedFrameIds = assigned;
                    }
                }
                else {
                    draft.playlists.push({
                        id,
                        title: title || "Album",
                        photoIds,
                        scheduleRule: null,
                        assignedFrameIds: assigned,
                        system: false,
                    });
                }
            }
        }
        (0, account_sync_state_1.bumpUserSyncVersion)(u);
    });
    const next = store_1.db.read().users.find((u) => u.id === user.userId);
    res.json({
        ok: true,
        sync_version: next?.syncVersion ?? 0,
        sync_updated_at: next?.syncUpdatedAtMs ?? Date.now(),
    });
});
/** POST /api/v1/user/frames/bind — claim/bind a frame MAC to this account (bumps sync_version). */
exports.userProfileRouter.post("/v1/user/frames/bind", (req, res) => {
    const user = authed(req);
    const bleMacRaw = String(req.body?.ble_mac ?? req.body?.mac ?? req.body?.frame_id ?? "").trim();
    const norm = (0, frame_mqtt_1.normalizeMac)(bleMacRaw);
    if (!norm || norm.length !== 12) {
        res.status(400).json({ ok: false, error: "invalid_mac" });
        return;
    }
    const setPrimary = req.body?.set_primary !== false;
    const frameNameIn = String(req.body?.frame_name ?? req.body?.display_name ?? "").trim();
    const wifiSsidIn = String(req.body?.wifi_ssid ?? req.body?.wifiSsid ?? "").trim();
    let frameId = "";
    let bleMacOut = norm;
    store_1.db.mutate((draft) => {
        // Prefer an existing real frame (BLE/STA related), never spawn junk IDs.
        let existing = (0, account_sync_state_1.findFrameByMac)(draft, norm);
        if (!existing) {
            // create only with 12-hex id == mac
            draft.frames.push({
                id: norm,
                bleMac: norm,
                ownerUserId: user.userId,
                sharedToUserIds: [],
                wifiSsid: null,
                wifiStatus: "never_provisioned",
                firmwareVersion: "unknown",
                lastSeenAtMs: null,
                uptimeMs: 0,
                pendingQueue: [],
                nextDeliveryAtMs: null,
                ota: { targetVersion: null, status: "idle" },
            });
            existing = draft.frames[draft.frames.length - 1];
        }
        else {
            const idx = draft.frames.findIndex((f) => f.id === existing.id);
            const f = draft.frames[idx];
            if (!f.ownerUserId || f.ownerUserId === "usr_1" || f.ownerUserId === user.userId) {
                f.ownerUserId = user.userId;
            }
            else if (!(f.sharedToUserIds || []).includes(user.userId)) {
                f.sharedToUserIds = [...(f.sharedToUserIds || []), user.userId];
            }
            // Keep station mac hint when client bound with STA.
            if (!f.stationMac && (0, account_sync_state_1.relatedMacKeys)(f.bleMac).includes(norm) && (0, frame_mqtt_1.normalizeMac)(f.bleMac) !== norm) {
                f.stationMac = norm;
            }
            existing = f;
        }
        if (frameNameIn) {
            existing.displayName = frameNameIn;
        }
        if (wifiSsidIn) {
            existing.wifiSsid = wifiSsidIn;
            if (existing.wifiStatus === "never_provisioned") {
                existing.wifiStatus = "offline";
            }
        }
        frameId = existing.id;
        bleMacOut = (0, frame_mqtt_1.normalizeMac)(existing.bleMac || norm);
        const u = draft.users.find((x) => x.id === user.userId);
        if (u) {
            if (setPrimary)
                u.primaryFrameId = bleMacOut;
            (0, account_sync_state_1.bumpUserSyncVersion)(u);
        }
        // Purge never-seen junk frames owned by this user that are unrelated.
        draft.frames = draft.frames.filter((f) => {
            if (f.ownerUserId !== user.userId)
                return true;
            if (f.id === frameId)
                return true;
            if (f.wifiStatus !== "never_provisioned")
                return true;
            if (f.wifiSsid || f.lastSeenAtMs)
                return true;
            const keys = (0, account_sync_state_1.relatedMacKeys)(f.bleMac || f.id);
            if (keys.includes(bleMacOut) || keys.includes(norm))
                return true;
            return false; // drop ghost
        });
    });
    const account = store_1.db.read().users.find((u) => u.id === user.userId);
    res.json({
        ok: true,
        frame_id: frameId,
        ble_mac: bleMacOut,
        sync_version: account?.syncVersion ?? 0,
        primary_frame_id: account?.primaryFrameId ?? null,
    });
});
exports.userProfileRouter.post("/v1/user/frames/:frameId/unbind", (req, res) => {
    const user = authed(req);
    const frameId = String(req.params.frameId ?? "").trim();
    if (!frameId) {
        res.status(400).json({ ok: false, error: "missing_frame_id" });
        return;
    }
    const data = store_1.db.read();
    const norm = (0, frame_mqtt_1.normalizeMac)(frameId);
    // Match BLE / STA / id siblings the same way bind does — otherwise
    // Delete Device succeeds locally but the cloud row survives and returns on re-login.
    const frame = (0, account_sync_state_1.findFrameByMac)(data, frameId);
    if (!frame) {
        // Idempotent: already unbound / never bound.
        const account = data.users.find((u) => u.id === user.userId);
        res.json({
            ok: true,
            frame_id: frameId,
            already_gone: true,
            sync_version: account?.syncVersion ?? 0,
        });
        return;
    }
    const isOwner = frame.ownerUserId === user.userId;
    const sharedIdx = (frame.sharedToUserIds || []).indexOf(user.userId);
    if (!isOwner && sharedIdx < 0) {
        // Family-only visibility without ownership/share row — still drop from family list below.
        const account = data.users.find((u) => u.id === user.userId);
        const inFamily = !!(account?.familyGroupId) &&
            !!data.familyGroups.find((g) => g.id === account.familyGroupId && (g.frameIds || []).includes(frame.id));
        if (!inFamily) {
            res.status(403).json({ ok: false, error: "not_owner" });
            return;
        }
    }
    let removedId = frame.id;
    store_1.db.mutate((draft) => {
        const live = (0, account_sync_state_1.findFrameByMac)(draft, frameId);
        if (!live)
            return;
        removedId = live.id;
        const u = draft.users.find((x) => x.id === user.userId);
        if (live.ownerUserId === user.userId) {
            // Owner delete: hard-remove the frame so it cannot rehydrate on any client.
            const idx = draft.frames.findIndex((f) => f.id === live.id);
            if (idx >= 0)
                draft.frames.splice(idx, 1);
            for (const g of draft.familyGroups) {
                if (Array.isArray(g.frameIds)) {
                    g.frameIds = g.frameIds.filter((fid) => fid !== live.id);
                }
            }
        }
        else {
            // Shared / family member: remove this user only; keep the owner's frame.
            live.sharedToUserIds = (live.sharedToUserIds || []).filter((id) => id !== user.userId);
            if (u?.familyGroupId) {
                const g = draft.familyGroups.find((fg) => fg.id === u.familyGroupId);
                if (g && Array.isArray(g.frameIds)) {
                    g.frameIds = g.frameIds.filter((fid) => fid !== live.id);
                }
            }
        }
        if (u) {
            const primaryKeys = new Set((0, account_sync_state_1.relatedMacKeys)(u.primaryFrameId || ""));
            if (u.primaryFrameId &&
                (primaryKeys.has(norm) ||
                    primaryKeys.has((0, frame_mqtt_1.normalizeMac)(live.bleMac)) ||
                    primaryKeys.has((0, frame_mqtt_1.normalizeMac)(live.stationMac || "")) ||
                    u.primaryFrameId === live.id)) {
                u.primaryFrameId = null;
            }
            (0, account_sync_state_1.bumpUserSyncVersion)(u);
        }
    });
    const account = store_1.db.read().users.find((u) => u.id === user.userId);
    res.json({
        ok: true,
        frame_id: removedId,
        sync_version: account?.syncVersion ?? 0,
    });
});
exports.userProfileRouter.get("/v1/user/frames", (req, res) => {
/** DELETE /api/frames/:mac — unbind frame from user account (alias for /v1/user/frames/:frameId/unbind).
 *  Accepts MAC, BLE MAC, station MAC, or frame ID. Hard-deletes owner frames; removes shared access for others.
 */
exports.userProfileRouter.delete("/frames/:mac", (req, res) => {
    const user = authed(req);
    const frameId = String(req.params.mac ?? "").trim();
    if (!frameId) {
        res.status(400).json({ ok: false, error: "missing_frame_id" });
        return;
    }
    const data = store_1.db.read();
    const norm = (0, frame_mqtt_1.normalizeMac)(frameId);
    // Match BLE / STA / id siblings the same way bind does.
    const frame = (0, account_sync_state_1.findFrameByMac)(data, frameId);
    if (!frame) {
        // Idempotent: already unbound / never bound.
        const account = data.users.find((u) => u.id === user.userId);
        res.json({
            ok: true,
            frame_id: frameId,
            already_gone: true,
            sync_version: account?.syncVersion ?? 0,
        });
        return;
    }
    const isOwner = frame.ownerUserId === user.userId;
    const sharedIdx = (frame.sharedToUserIds || []).indexOf(user.userId);
    if (!isOwner && sharedIdx < 0) {
        // Family-only visibility without ownership/share row — still drop from family list below.
        const account = data.users.find((u) => u.id === user.userId);
        const inFamily = !!(account?.familyGroupId) &&
            !!data.familyGroups.find((g) => g.id === account.familyGroupId && (g.frameIds || []).includes(frame.id));
        if (!inFamily) {
            res.status(403).json({ ok: false, error: "not_owner" });
            return;
        }
    }
    let removedId = frame.id;
    store_1.db.mutate((draft) => {
        const live = (0, account_sync_state_1.findFrameByMac)(draft, frameId);
        if (!live)
            return;
        removedId = live.id;
        const u = draft.users.find((x) => x.id === user.userId);
        if (live.ownerUserId === user.userId) {
            // Owner delete: hard-remove the frame so it cannot rehydrate on any client.
            const idx = draft.frames.findIndex((f) => f.id === live.id);
            if (idx >= 0)
                draft.frames.splice(idx, 1);
            for (const g of draft.familyGroups) {
                if (Array.isArray(g.frameIds)) {
                    g.frameIds = g.frameIds.filter((fid) => fid !== live.id);
                }
            }
        }
        else {
            // Shared / family member: remove this user only; keep the owner's frame.
            live.sharedToUserIds = (live.sharedToUserIds || []).filter((id) => id !== user.userId);
            if (u?.familyGroupId) {
                const g = draft.familyGroups.find((fg) => fg.id === u.familyGroupId);
                if (g && Array.isArray(g.frameIds)) {
                    g.frameIds = g.frameIds.filter((fid) => fid !== live.id);
                }
            }
        }
        if (u) {
            const primaryKeys = new Set((0, account_sync_state_1.relatedMacKeys)(u.primaryFrameId || ""));
            if (u.primaryFrameId &&
                (primaryKeys.has(norm) ||
                    primaryKeys.has((0, frame_mqtt_1.normalizeMac)(live.bleMac)) ||
                    primaryKeys.has((0, frame_mqtt_1.normalizeMac)(live.stationMac || "")) ||
                    u.primaryFrameId === live.id)) {
                u.primaryFrameId = null;
            }
            (0, account_sync_state_1.bumpUserSyncVersion)(u);
        }
    });
    const account = store_1.db.read().users.find((u) => u.id === user.userId);
    res.json({
        ok: true,
        frame_id: removedId,
        sync_version: account?.syncVersion ?? 0,
    });
});
    const user = authed(req);
    const data = store_1.db.read();
    const boundFrames = (0, account_sync_state_1.visibleFramesForUser)(data, user.userId);
    res.json({
        ok: true,
        frames: boundFrames.map((f) => ({
            frame_id: f.id,
            ble_mac: f.bleMac,
            wifi_ssid: f.wifiSsid,
            online: f.wifiStatus === "online",
            firmware_version: f.firmwareVersion,
            last_seen_at: f.lastSeenAtMs,
            is_owner: f.ownerUserId === user.userId,
        })),
    });
});
