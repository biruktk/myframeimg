"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initQueue = initQueue;
exports.enqueueUpload = enqueueUpload;
exports.isDeliverySlotFree = isDeliverySlotFree;
exports.scheduleNextDelivery = scheduleNextDelivery;
exports.playAckReceived = playAckReceived;
const store_1 = require("../db/store");
const frame_mqtt_1 = require("./frame_mqtt");
const slideshow_index_1 = require("./slideshow_index");
const QUEUE_INTERVAL_MS = 60000;
let queueTimer = null;
let publicBaseUrl = "";
function initQueue(baseUrl) {
    publicBaseUrl = baseUrl.replace(/\/$/, "");
    (0, frame_mqtt_1.setPlayAckHandler)(playAckReceived);
    if (queueTimer)
        return;
    queueTimer = setInterval(processQueue, 30000);
    processQueue();
}
function enqueueUpload(deviceId, uploadId) {
    store_1.db.mutate((draft) => {
        draft.frames = draft.frames.map((f) => {
            if (f.id !== deviceId)
                return f;
            const q = f.pendingQueue || [];
            if (!q.includes(uploadId))
                q.push(uploadId);
            return { ...f, pendingQueue: q };
        });
    });
}
function isDeliverySlotFree(deviceId) {
    const data = store_1.db.read();
    const frame = data.frames.find((f) => f.id === deviceId);
    if (!frame)
        return true;
    if ((frame.pendingQueue?.length ?? 0) > 0)
        return false;
    if (frame.nextDeliveryAtMs && Date.now() < frame.nextDeliveryAtMs)
        return false;
    return true;
}
function scheduleNextDelivery(deviceId) {
    store_1.db.mutate((draft) => {
        draft.frames = draft.frames.map((f) => {
            if (f.id !== deviceId)
                return f;
            return { ...f, nextDeliveryAtMs: Date.now() + QUEUE_INTERVAL_MS };
        });
    });
}
function normalizeBleKey(raw) {
    try {
        return decodeURIComponent(raw).replace(/[^a-fA-F0-9]/g, "").toUpperCase();
    }
    catch {
        return raw.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
    }
}
function hasActiveSlideshow(data, mac) {
    const macKey = normalizeBleKey(mac);
    const s = data.slideshowsByBleMac?.[macKey];
    return !!(s && s.imageIds.length > 0);
}
function playAckReceived(macRaw) {
    const mac = (0, frame_mqtt_1.resolveMqttHardwareMac)(macRaw);
    if (!mac)
        return;
    const data = store_1.db.read();
    const frame = data.frames.find((f) => (0, frame_mqtt_1.resolveMqttHardwareMac)(f.id) === mac);
    if (!frame)
        return;
    if (hasActiveSlideshow(data, mac)) {
        store_1.db.mutate((draft) => {
            draft.frames = draft.frames.map((f) => {
                if (f.id !== frame.id)
                    return f;
                return { ...f, nextDeliveryAtMs: null };
            });
        });
        return;
    }
    const q = frame.pendingQueue || [];
    if (q.length === 0) {
        store_1.db.mutate((draft) => {
            draft.frames = draft.frames.map((f) => {
                if (f.id !== frame.id)
                    return f;
                return { ...f, nextDeliveryAtMs: null };
            });
        });
        return;
    }
    const nextId = q[0];
    const upload = data.uploads.find((u) => u.id === nextId);
    if (!upload) {
        store_1.db.mutate((draft) => {
            draft.frames = draft.frames.map((f) => {
                if (f.id !== frame.id)
                    return f;
                return { ...f, pendingQueue: q.slice(1) };
            });
        });
        return;
    }
    const imageUrl = `${publicBaseUrl}/frame-media/${encodeURIComponent(upload.filename)}`;
    if (!(0, frame_mqtt_1.isMqttConnected)()) {
        return;
    }
    (0, frame_mqtt_1.publishPlayImage)(frame.id, imageUrl).then(() => {
        store_1.db.mutate((draft) => {
            draft.frames = draft.frames.map((f) => {
                if (f.id !== frame.id)
                    return f;
                return { ...f, pendingQueue: q.slice(1), nextDeliveryAtMs: Date.now() + QUEUE_INTERVAL_MS };
            });
            const upd = draft.uploads.find((u) => u.id === nextId);
            if (upd) {
                upd.deliveredToFrame = true;
                upd.deliveryMode = "vps_mqtt";
                upd.deliveryCheckedAtMs = Date.now();
            }
        });
    }).catch(() => { });
}
function processQueue() {
    const data = store_1.db.read();
    const now = Date.now();
    for (const frame of data.frames) {
        const q = frame.pendingQueue || [];
        if (q.length > 0) {
            if (frame.nextDeliveryAtMs && now < frame.nextDeliveryAtMs)
                continue;
            if (!(0, frame_mqtt_1.isMqttConnected)())
                continue;
            const nextId = q[0];
            const upload = data.uploads.find((u) => u.id === nextId);
            if (!upload) {
                store_1.db.mutate((draft) => {
                    draft.frames = draft.frames.map((f) => {
                        if (f.id !== frame.id)
                            return f;
                        return { ...f, pendingQueue: q.slice(1) };
                    });
                });
                continue;
            }
            const imageUrl = `${publicBaseUrl}/frame-media/${encodeURIComponent(upload.filename)}`;
            (0, frame_mqtt_1.publishPlayImage)(frame.id, imageUrl).then(() => {
                store_1.db.mutate((draft) => {
                    draft.frames = draft.frames.map((f) => {
                        if (f.id !== frame.id)
                            return f;
                        return { ...f, pendingQueue: q.slice(1), nextDeliveryAtMs: Date.now() + QUEUE_INTERVAL_MS };
                    });
                    const upd = draft.uploads.find((u) => u.id === nextId);
                    if (upd) {
                        upd.deliveredToFrame = true;
                        upd.deliveryMode = "vps_mqtt";
                        upd.deliveryCheckedAtMs = Date.now();
                    }
                });
            }).catch(() => { });
            continue;
        }
    }
    processAllSlideshows(data, now);
}
function processAllSlideshows(data, now) {
    if (!(0, frame_mqtt_1.isMqttConnected)())
        return;
    const sb = data.slideshowsByBleMac;
    if (!sb)
        return;
    for (const [macKey, slideshow] of Object.entries(sb)) {
        if (!slideshow || slideshow.imageIds.length === 0)
            continue;
        // Check expiration — persist removal (empty mutate used to leave ghosts forever).
        if (slideshow.endtime && now > Number(slideshow.endtime)) {
            console.log(`[slideshow] ${macKey} expired at ${slideshow.endtime}, removing`);
            store_1.db.mutate((draft) => {
                if (draft.slideshowsByBleMac && draft.slideshowsByBleMac[macKey]) {
                    delete draft.slideshowsByBleMac[macKey];
                }
            });
            continue;
        }
        if (now < slideshow.nextPlayAtMs)
            continue;
        const n = slideshow.imageIds.length;
        // currentIndex = last played (or -1 if nothing yet in random mode).
        // Sequential: (currentIndex + 1) % n. Random: uniform pick ≠ currentIndex.
        const nextIndex = (0, slideshow_index_1.nextSlideshowIndex)({
            strategy: slideshow.strategy,
            currentIndex: slideshow.currentIndex,
            total: n,
        });
        const imageId = slideshow.imageIds[nextIndex];
        const upload = data.uploads.find((u) => u.id === imageId) ?? data.uploads.find((u) => u.filename === imageId);
        if (!upload) {
            store_1.db.mutate((draft) => {
                const s = draft.slideshowsByBleMac?.[macKey];
                if (!s)
                    return;
                // Advance past missing media with the same strategy (do not force sequential).
                s.currentIndex = (0, slideshow_index_1.nextSlideshowIndex)({
                    strategy: s.strategy,
                    currentIndex: nextIndex,
                    total: s.imageIds.length,
                });
            });
            continue;
        }
        const imageUrl = `${publicBaseUrl}/frame-media/${encodeURIComponent(upload.filename)}`;
        console.log(`[slideshow] play mac=%s strategy=%s idx=%d/%d id=%s`, macKey, Math.round(Number(slideshow.strategy)) === 2 ? "random" : "sequential", nextIndex, n, imageId);
        (0, frame_mqtt_1.publishPlayImage)(macKey, imageUrl).then(() => {
            store_1.db.mutate((draft) => {
                const s = draft.slideshowsByBleMac?.[macKey];
                if (!s)
                    return;
                s.currentIndex = nextIndex;
                s.nextPlayAtMs = Date.now() + s.intervalMinutes * 60 * 1000;
                const upd = draft.uploads.find((u) => u.id === imageId || u.filename === imageId);
                if (upd) {
                    upd.deliveredToFrame = true;
                    upd.deliveryMode = "slideshow";
                    upd.deliveryCheckedAtMs = Date.now();
                }
            });
        }).catch(() => { });
    }
}
