"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bumpUserSyncVersion = bumpUserSyncVersion;
exports.relatedMacKeys = relatedMacKeys;
exports.findFrameByMac = findFrameByMac;
exports.visibleFramesForUser = visibleFramesForUser;
exports.frameDisplayName = frameDisplayName;
exports.playlistsMetaForUser = playlistsMetaForUser;
const frame_mqtt_1 = require("./frame_mqtt");
/** Bump per-user sync version (call inside db.mutate). */
function bumpUserSyncVersion(user) {
    user.syncVersion = (user.syncVersion ?? 0) + 1;
    user.syncUpdatedAtMs = Date.now();
}
/** ESP32 Wi‑Fi STA is often BLE MAC with last byte - 2. */
function relatedMacKeys(raw) {
    const n = (0, frame_mqtt_1.normalizeMac)(raw);
    if (!n || n.length < 12)
        return n ? [n] : [];
    const keys = new Set([n]);
    try {
        const v = BigInt("0x" + n);
        const asSta = (v - 2n).toString(16).toUpperCase().padStart(12, "0");
        const asBle = (v + 2n).toString(16).toUpperCase().padStart(12, "0");
        if (asSta.length === 12)
            keys.add(asSta);
        if (asBle.length === 12)
            keys.add(asBle);
    }
    catch {
        /* ignore */
    }
    return [...keys];
}
function findFrameByMac(data, rawMac) {
    const keys = new Set(relatedMacKeys(rawMac));
    if (!keys.size)
        return undefined;
    return data.frames.find((f) => {
        const cands = [f.bleMac, f.id, f.stationMac ?? ""].flatMap((x) => relatedMacKeys(x));
        return cands.some((c) => keys.has(c));
    });
}
function visibleFramesForUser(data, userId) {
    const user = data.users.find((u) => u.id === userId);
    const ids = new Set();
    for (const f of data.frames) {
        if (f.ownerUserId === userId)
            ids.add(f.id);
        if (Array.isArray(f.sharedToUserIds) && f.sharedToUserIds.includes(userId))
            ids.add(f.id);
        const legacyFamilyId = f.familyId;
        if (legacyFamilyId && user?.familyGroupId && legacyFamilyId === user.familyGroupId) {
            ids.add(f.id);
        }
    }
    if (user?.familyGroupId) {
        const g = data.familyGroups.find((fg) => fg.id === user.familyGroupId);
        if (g) {
            for (const fid of g.frameIds)
                ids.add(fid);
        }
    }
    // Only share frames that finished setup (named + Wi-Fi).
    // BLE-paired-but-not-provisioned must stay private to the pairing phone.
    return data.frames.filter((f) => {
        if (!ids.has(f.id))
            return false;
        const named = String(f.displayName || "").trim();
        if (!named)
            return false;
        const ssid = String(f.wifiSsid || "").trim();
        if (f.wifiStatus === "never_provisioned" && !ssid)
            return false;
        return true;
    });
}
function frameDisplayName(f) {
    return String(f.displayName || "").trim();
}
/** Playlist structure only — photo IDs, no binary payloads. */
function playlistsMetaForUser(data, userId) {
    const visible = new Set(visibleFramesForUser(data, userId).map((f) => f.id));
    return data.playlists
        .filter((p) => {
        if (p.system)
            return false;
        const owner = p.ownerUserId;
        if (owner)
            return owner === userId;
        if (!p.assignedFrameIds?.length)
            return false; // unowned orphans stay private
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
