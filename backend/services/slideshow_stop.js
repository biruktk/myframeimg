"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mediaTokensFromIds = mediaTokensFromIds;
exports.macKeysForDeletedPlaylist = macKeysForDeletedPlaylist;
exports.clearSlideshowEntries = clearSlideshowEntries;
exports.resolveFallbackPlayUrl = resolveFallbackPlayUrl;
exports.notifyFrameStopPlayback = notifyFrameStopPlayback;
exports.stopPlaybackForMacKeys = stopPlaybackForMacKeys;
exports.stopPlaybackForDeletedPlaylist = stopPlaybackForDeletedPlaylist;
exports.stopPlaybackIfSlideshowEmpty = stopPlaybackIfSlideshowEmpty;
/**
 * Powerful stop after playlist/album delete.
 * Clears server slideshow rotation, MQTT-notifies the frame, then plays a
 * fallback image so the panel does not keep showing deleted playlist content:
 *   1) latest single cast (.bin) for that MAC
 *   2) FRAME_IDLE_PLAY_URL / FRAME_CONNECTED_PLAY_URL env .bin
 */
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const store_1 = require("../db/store");
const frame_mqtt_1 = require("./frame_mqtt");
function macKeyVariants(raw) {
    const out = new Set();
    const n = (0, frame_mqtt_1.normalizeMac)(raw);
    if (n)
        out.add(n);
    const hw = (0, frame_mqtt_1.resolveMqttHardwareMac)(raw);
    if (hw)
        out.add((0, frame_mqtt_1.normalizeMac)(hw));
    return [...out].filter((k) => k.length >= 8);
}
function frameMacKeys(frame) {
    const keys = new Set();
    for (const raw of [frame.id, frame.bleMac, frame.stationMac ?? ""]) {
        if (!raw)
            continue;
        for (const k of macKeyVariants(String(raw)))
            keys.add(k);
    }
    return [...keys];
}
function deviceMatchesMac(deviceId, macKeys) {
    const d = String(deviceId || "").trim();
    if (!d)
        return false;
    if (macKeys.has(d) || macKeys.has((0, frame_mqtt_1.normalizeMac)(d)))
        return true;
    for (const k of macKeyVariants(d)) {
        if (macKeys.has(k))
            return true;
    }
    return false;
}
/** Expand playlist photoIds to upload id + filename tokens used in slideshows. */
function mediaTokensFromIds(photoIds) {
    const tokens = new Set();
    const data = store_1.db.read();
    for (const raw of photoIds) {
        const id = String(raw || "").trim();
        if (!id)
            continue;
        tokens.add(id);
        const base = id.split("/").pop() || id;
        if (base)
            tokens.add(base);
        const upload = data.uploads.find((u) => u.id === id ||
            u.filename === id ||
            u.filename === base ||
            u.previewFilename === id);
        if (upload) {
            tokens.add(upload.id);
            if (upload.filename)
                tokens.add(upload.filename);
            if (upload.previewFilename)
                tokens.add(upload.previewFilename);
            const fnBase = upload.filename?.split("/").pop();
            if (fnBase)
                tokens.add(fnBase);
        }
    }
    return tokens;
}
function slideshowIntersects(imageIds, tokens) {
    if (!imageIds?.length || !tokens.size)
        return false;
    for (const img of imageIds) {
        const id = String(img || "").trim();
        if (!id)
            continue;
        if (tokens.has(id))
            return true;
        const base = id.split("/").pop() || id;
        if (tokens.has(base))
            return true;
    }
    return false;
}
/**
 * Resolve which slideshow MAC keys should stop for a deleted playlist.
 * Union of assigned frames + overlapping slideshows + optional owner frames
 * that currently have an active slideshow (powerful delete).
 */
function macKeysForDeletedPlaylist(playlist) {
    const data = store_1.db.read();
    const keys = new Set();
    const tokens = mediaTokensFromIds(playlist.photoIds ?? []);
    for (const fid of playlist.assignedFrameIds ?? []) {
        const frame = data.frames.find((f) => f.id === fid || (0, frame_mqtt_1.normalizeMac)(f.bleMac) === (0, frame_mqtt_1.normalizeMac)(fid));
        if (frame) {
            for (const k of frameMacKeys(frame))
                keys.add(k);
        }
        else {
            for (const k of macKeyVariants(fid))
                keys.add(k);
        }
    }
    const slides = data.slideshowsByBleMac || {};
    for (const [macKey, slide] of Object.entries(slides)) {
        if (slideshowIntersects(slide?.imageIds, tokens)) {
            keys.add(macKey);
            for (const k of macKeyVariants(macKey))
                keys.add(k);
        }
    }
    // Powerful delete: if still no MACs but owner has frames with active slideshows,
    // stop those too (covers local album ids that never set assignedFrameIds).
    if (!keys.size && playlist.ownerUserId) {
        const ownerFrames = data.frames.filter((f) => f.ownerUserId === playlist.ownerUserId);
        for (const frame of ownerFrames) {
            const fkeys = frameMacKeys(frame);
            const hasSlide = fkeys.some((k) => {
                const s = slides[k] || slides[(0, frame_mqtt_1.normalizeMac)(k)];
                return !!(s && s.imageIds && s.imageIds.length);
            });
            if (hasSlide) {
                for (const k of fkeys)
                    keys.add(k);
            }
        }
    }
    return [...keys];
}
/** Clear server slideshow row(s) for MAC key variants. */
function clearSlideshowEntries(macKeys) {
    const cleared = new Set();
    if (!macKeys.length)
        return [];
    const want = new Set();
    for (const k of macKeys) {
        for (const v of macKeyVariants(k))
            want.add(v);
        want.add(k);
    }
    store_1.db.mutate((draft) => {
        if (!draft.slideshowsByBleMac)
            return;
        for (const key of Object.keys(draft.slideshowsByBleMac)) {
            if (!want.has(key) && !want.has((0, frame_mqtt_1.normalizeMac)(key)))
                continue;
            delete draft.slideshowsByBleMac[key];
            cleared.add(key);
        }
    });
    return [...cleared];
}
function publicBinUrl(filename) {
    const base = String(process.env.PUBLIC_MEDIA_BASE_URL || process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
    const name = path_1.default.basename(String(filename || "").trim());
    if (!name.toLowerCase().endsWith(".bin"))
        return null;
    const uploadDir = path_1.default.resolve(process.cwd(), process.env.UPLOAD_DIR || "uploads");
    const disk = path_1.default.join(uploadDir, name);
    if (!fs_1.default.existsSync(disk))
        return null;
    const rel = `/frame-media/${encodeURIComponent(name)}`;
    return base ? `${base}${rel}` : rel;
}
/**
 * Prefer last single cast for this MAC (not slideshow/gallery_sync).
 * Exclude playlist tokens so we don't "fall back" to a deleted playlist image.
 */
function resolveFallbackPlayUrl(macRaw, excludeTokens) {
    const mac = (0, frame_mqtt_1.resolveMqttHardwareMac)(macRaw) ?? (0, frame_mqtt_1.normalizeMac)(macRaw);
    if (!mac)
        return null;
    const macKeys = new Set(macKeyVariants(mac));
    const data = store_1.db.read();
    const exclude = excludeTokens || new Set();
    const singles = data.uploads
        .filter((u) => {
        if (!deviceMatchesMac(u.deviceId, macKeys))
            return false;
        const fn = String(u.filename || "");
        if (!fn.toLowerCase().endsWith(".bin"))
            return false;
        const mode = String(u.deliveryMode || "");
        if (mode === "gallery_sync" || mode === "slideshow")
            return false;
        // Prefer actual plays; allow stored_only .bin as last resort.
        const base = fn.split("/").pop() || fn;
        if (exclude.has(u.id) || exclude.has(fn) || exclude.has(base))
            return false;
        return true;
    })
        .sort((a, b) => b.atMs - a.atMs);
    for (const u of singles) {
        // Prefer ones that were delivered / mqtt-played.
        if (u.deliveredToFrame || u.deliveryMode === "vps_mqtt" || u.deliveryMode === "mqtt") {
            const url = publicBinUrl(u.filename);
            if (url)
                return url;
        }
    }
    for (const u of singles) {
        const url = publicBinUrl(u.filename);
        if (url)
            return url;
    }
    const envIdle = String(process.env.FRAME_IDLE_PLAY_URL || process.env.FRAME_CONNECTED_PLAY_URL || "").trim();
    if (envIdle)
        return envIdle;
    // Last resort: any .bin named like connected/idle/default in uploads.
    try {
        const uploadDir = path_1.default.resolve(process.cwd(), process.env.UPLOAD_DIR || "uploads");
        const files = fs_1.default.readdirSync(uploadDir);
        const hit = files.find((f) => /^(connected|idle|default|welcome|logo).*\.bin$/i.test(f));
        if (hit)
            return publicBinUrl(hit);
    }
    catch {
        /* ignore */
    }
    return null;
}
/**
 * Notify the frame to stop playlist playback and show a fallback image.
 */
async function notifyFrameStopPlayback(macRaw, options) {
    const mac = (0, frame_mqtt_1.resolveMqttHardwareMac)(macRaw) ?? (0, frame_mqtt_1.normalizeMac)(macRaw);
    if (!mac || !(0, frame_mqtt_1.isMqttConnected)())
        return { fallbackUrl: null };
    await (0, frame_mqtt_1.publishMqttAction)(mac, "stop").catch((err) => {
        console.warn("[slideshow-stop] stop action failed", mac, err);
    });
    await (0, frame_mqtt_1.publishStrategyCommand)(mac, {
        strategy: 1,
        intervalMinutes: 60 * 24 * 365,
        begintime: "",
        endtime: "",
        idle: 1,
    }).catch((err) => {
        console.warn("[slideshow-stop] strategy idle failed", mac, err);
    });
    const playFallback = options?.playFallback !== false;
    let fallbackUrl = null;
    if (playFallback) {
        fallbackUrl = resolveFallbackPlayUrl(mac, options?.excludeTokens);
        if (fallbackUrl) {
            await (0, frame_mqtt_1.publishPlayImage)(mac, fallbackUrl).catch((err) => {
                console.warn("[slideshow-stop] fallback play failed", mac, err);
                fallbackUrl = null;
            });
        }
        else {
            console.warn("[slideshow-stop] no fallback .bin for", mac);
        }
    }
    return { fallbackUrl };
}
/** Clear slideshow DB state and MQTT-notify each affected MAC (with fallback play). */
async function stopPlaybackForMacKeys(macKeys, options) {
    const unique = [
        ...new Set(macKeys.map((k) => (0, frame_mqtt_1.normalizeMac)(k) || k).filter(Boolean)),
    ];
    const cleared = clearSlideshowEntries(unique);
    const notified = [];
    const fallbackUrls = {};
    for (const key of unique) {
        try {
            const r = await notifyFrameStopPlayback(key, options);
            notified.push(key);
            fallbackUrls[key] = r.fallbackUrl;
        }
        catch (err) {
            console.warn("[slideshow-stop] notify failed", key, err);
        }
    }
    return { cleared, notified, fallbackUrls };
}
/** Stop frames that were playing a deleted playlist/album (powerful). */
async function stopPlaybackForDeletedPlaylist(playlist) {
    const macKeys = macKeysForDeletedPlaylist(playlist);
    const exclude = mediaTokensFromIds(playlist.photoIds ?? []);
    return stopPlaybackForMacKeys(macKeys, {
        excludeTokens: exclude,
        playFallback: true,
    });
}
/**
 * After stripping a media id from slideshows, stop any MAC whose list is now empty.
 */
async function stopPlaybackIfSlideshowEmpty(macKeysTouched) {
    const data = store_1.db.read();
    const slides = data.slideshowsByBleMac || {};
    const toStop = [];
    for (const key of macKeysTouched) {
        const n = (0, frame_mqtt_1.normalizeMac)(key) || key;
        const s = slides[key] || slides[n];
        if (!s || !s.imageIds?.length) {
            toStop.push(key);
        }
    }
    if (toStop.length)
        await stopPlaybackForMacKeys(toStop, { playFallback: true });
}
