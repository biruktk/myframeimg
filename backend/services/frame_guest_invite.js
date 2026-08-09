"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateInviteGuestCode = generateInviteGuestCode;
exports.lookupFrameInviteDeviceId = lookupFrameInviteDeviceId;
exports.getInviteByCode = getInviteByCode;
exports.publicInviteBaseUrl = publicInviteBaseUrl;
exports.createOrFetchInvite = createOrFetchInvite;
const crypto_1 = __importDefault(require("crypto"));
const store_1 = require("../db/store");
const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateInviteGuestCode() {
    const bytes = crypto_1.default.randomBytes(8);
    let s = "";
    for (let i = 0; i < 8; i++) {
        s += INVITE_CODE_ALPHABET[bytes[i] % INVITE_CODE_ALPHABET.length];
    }
    return s;
}
function normalizeCode(raw) {
    return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function lookupFrameInviteDeviceId(rawCode) {
    const code = normalizeCode(rawCode);
    if (code.length !== 8)
        return null;
    const row = store_1.db.read().frameGuestInvites?.find((r) => r.code === code);
    return row?.deviceId ?? null;
}
function getInviteByCode(rawCode) {
    const code = normalizeCode(rawCode);
    if (code.length !== 8)
        return null;
    const row = store_1.db.read().frameGuestInvites?.find((r) => r.code === code);
    if (!row)
        return null;
    return { ...row };
}
function publicInviteBaseUrl() {
    return (String(process.env.PUBLIC_INVITE_BASE_URL ?? process.env.PUBLIC_BASE_URL ?? "https://myframe.ink").replace(/\/+$/, "") + "");
}
function createOrFetchInvite(deviceId, ownerUserId) {
    const snapshot = store_1.db.read();
    const invites = snapshot.frameGuestInvites ?? [];
    const existing = invites.find((r) => r.deviceId === deviceId);
    if (existing) {
        const base = publicInviteBaseUrl();
        return {
            code: existing.code,
            url: `${base}/invite/${existing.code}`,
        };
    }
    let code;
    for (let attempt = 0; attempt < 20; attempt++) {
        code = generateInviteGuestCode();
        if (!invites.some((r) => r.code === code))
            break;
    }
    const finalCode = code;
    const createdAtMs = Date.now();
    const inv = {
        code: finalCode,
        deviceId,
        ownerUserId: ownerUserId ?? null,
        createdAtMs,
    };
    store_1.db.mutate((draft) => {
        if (!draft.frameGuestInvites)
            draft.frameGuestInvites = [];
        const idx = draft.frameGuestInvites.findIndex((r) => r.deviceId === deviceId);
        if (idx >= 0) {
            draft.frameGuestInvites[idx] = inv;
        }
        else {
            draft.frameGuestInvites.push(inv);
        }
    });
    const base = publicInviteBaseUrl();
    return {
        code: finalCode,
        url: `${base}/invite/${finalCode}`,
    };
}
