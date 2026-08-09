"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isFirebaseConfigured = isFirebaseConfigured;
exports.normalizeDeviceKey = normalizeDeviceKey;
exports.sendPushToUser = sendPushToUser;
exports.sendPushToFrameSubscribers = sendPushToFrameSubscribers;
const app_1 = require("firebase-admin/app");
const messaging_1 = require("firebase-admin/messaging");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const store_1 = require("../db/store");
let _app = null;
function getServiceAccountPath() {
    const envPath = String(process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? "").trim();
    if (envPath) {
        const resolved = path_1.default.resolve(__dirname, "..", "..", envPath);
        if (fs_1.default.existsSync(resolved))
            return resolved;
        return null;
    }
    const secretsDir = path_1.default.resolve(__dirname, "..", "..", "secrets");
    if (!fs_1.default.existsSync(secretsDir))
        return null;
    const files = fs_1.default.readdirSync(secretsDir).filter((f) => f.endsWith(".json") && f.includes("firebase"));
    if (files.length === 0)
        return null;
    const sorted = files.sort().reverse();
    return path_1.default.join(secretsDir, sorted[0]);
}
function isFirebaseConfigured() {
    try {
        return getServiceAccountPath() !== null || String(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 ?? "").trim().length > 0;
    }
    catch {
        return false;
    }
}
function initFirebase() {
    if (_app)
        return _app;
    const base64 = String(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 ?? "").trim();
    let credential;
    if (base64) {
        const decoded = JSON.parse(Buffer.from(base64, "base64").toString("utf-8"));
        credential = (0, app_1.cert)(decoded);
    }
    else {
        const saPath = getServiceAccountPath();
        if (!saPath)
            throw new Error("Firebase service account not found");
        process.env.GOOGLE_APPLICATION_CREDENTIALS = saPath;
        credential = (0, app_1.applicationDefault)();
    }
    _app = (0, app_1.initializeApp)({ credential, projectId: "myframe-b9ba9" });
    return _app;
}
/** Strip separators so D0:CF:13… and D0CF13… compare equal. */
function normalizeDeviceKey(value) {
    return String(value ?? "").replace(/[^a-fA-F0-9]/gi, "").toLowerCase();
}
function findFrameForDevice(frameDeviceId) {
    const data = store_1.db.read();
    const raw = String(frameDeviceId ?? "").trim();
    if (!raw)
        return undefined;
    const norm = normalizeDeviceKey(raw);
    return data.frames.find((f) => {
        if (f.id === raw || f.bleMac === raw)
            return true;
        if (norm && normalizeDeviceKey(f.id) === norm)
            return true;
        if (norm && normalizeDeviceKey(f.bleMac ?? "") === norm)
            return true;
        return false;
    });
}
async function sendPushToUser(userId, title, body) {
    if (!userId || !isFirebaseConfigured())
        return;
    const data = store_1.db.read();
    const user = data.users.find((u) => u.id === userId);
    const tokens = user?.fcmTokens ?? [];
    if (tokens.length === 0) {
        console.warn(`[push] user ${userId} has no fcmTokens`);
        return;
    }
    const messaging = (0, messaging_1.getMessaging)(initFirebase());
    const results = await Promise.allSettled(tokens.map((token) => messaging.send({
        token,
        notification: { title, body },
        apns: {
            payload: { aps: { sound: "default", badge: 1 } },
        },
        android: {
            priority: "high",
            notification: { channelId: "myframe_uploads" },
        },
    })));
    const invalidTokens = new Set();
    results.forEach((r, i) => {
        if (r.status === "rejected") {
            console.error(`[push] token send failed for ${userId}:`, r.reason);
            const msg = String(r.reason ?? "");
            if (msg.includes("registration-token-not-registered") || msg.includes("invalid-registration-token")) {
                invalidTokens.add(tokens[i]);
            }
        }
        else {
            console.log(`[push] sent to ${userId} ok`);
        }
    });
    if (invalidTokens.size > 0) {
        store_1.db.mutate((draft) => {
            draft.users = draft.users.map((u) => {
                if (u.id !== userId)
                    return u;
                return {
                    ...u,
                    fcmTokens: (u.fcmTokens ?? []).filter((t) => !invalidTokens.has(t)),
                };
            });
        });
    }
}
/**
 * Notify frame owner, shared users, family members, and optionally the uploader.
 * Device ids are matched with/without colon separators (D0CF13… ≡ D0:CF:13:…).
 */
function sendPushToFrameSubscribers(frameDeviceId, title, body, options) {
    const opts = typeof options === "string" ? { excludeUserId: options } : options ?? {};
    const data = store_1.db.read();
    const frame = findFrameForDevice(frameDeviceId);
    const userIds = new Set();
    if (frame?.ownerUserId)
        userIds.add(frame.ownerUserId);
    for (const uid of frame?.sharedToUserIds ?? []) {
        if (uid)
            userIds.add(uid);
    }
    const owner = frame?.ownerUserId
        ? data.users.find((u) => u.id === frame.ownerUserId)
        : undefined;
    if (owner?.familyGroupId) {
        const group = data.familyGroups?.find((g) => g.id === owner.familyGroupId);
        if (group) {
            for (const m of group.members) {
                if (m.userId)
                    userIds.add(m.userId);
            }
        }
    }
    if (opts.alsoNotifyUserId)
        userIds.add(opts.alsoNotifyUserId);
    if (opts.excludeUserId)
        userIds.delete(opts.excludeUserId);
    userIds.delete("");
    if (userIds.size === 0) {
        console.warn(`[push] no recipients for device=${frameDeviceId} frameFound=${Boolean(frame)}`);
        return;
    }
    console.log(`[push] device=${frameDeviceId} frame=${frame?.id ?? "none"} recipients=${[...userIds].join(",")}`);
    for (const uid of userIds) {
        sendPushToUser(uid, title, body).catch((e) => console.error(`[push] sendPushToUser ${uid} failed:`, e));
    }
}
