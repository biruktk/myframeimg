"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lookupFrameInviteDeviceId = lookupFrameInviteDeviceId;
const store_1 = require("../db/store");
function lookupFrameInviteDeviceId(code) {
    const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (normalized.length !== 8)
        return null;
    const row = store_1.db.read().frameGuestInvites?.find((r) => r.code === normalized);
    return row?.deviceId ?? null;
}
