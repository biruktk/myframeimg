"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.USER_GALLERY_MAX_PER_USER = void 0;
exports.ensureUserGalleryPhotos = ensureUserGalleryPhotos;
exports.registerUserGalleryPhoto = registerUserGalleryPhoto;
exports.listUserGalleryPhotos = listUserGalleryPhotos;
const crypto_1 = __importDefault(require("crypto"));
exports.USER_GALLERY_MAX_PER_USER = 20;
function ensureUserGalleryPhotos(draft) {
    if (!Array.isArray(draft.userGalleryPhotos)) {
        draft.userGalleryPhotos = [];
    }
}
function registerUserGalleryPhoto(draft, userId, previewFilename, meta) {
    ensureUserGalleryPhotos(draft);
    const now = Date.now();
    const entry = {
        id: `ug_${now}_${crypto_1.default.randomBytes(3).toString("hex")}`,
        userId,
        previewFilename,
        atMs: now,
        deviceId: meta?.deviceId,
    };
    const others = draft.userGalleryPhotos.filter((p) => p.userId !== userId);
    const mine = draft.userGalleryPhotos.filter((p) => p.userId === userId);
    const nextMine = [entry, ...mine].slice(0, exports.USER_GALLERY_MAX_PER_USER);
    draft.userGalleryPhotos = [...nextMine, ...others];
    return entry;
}
function listUserGalleryPhotos(draft, userId) {
    ensureUserGalleryPhotos(draft);
    return draft
        .userGalleryPhotos.filter((p) => p.userId === userId)
        .sort((a, b) => b.atMs - a.atMs)
        .slice(0, exports.USER_GALLERY_MAX_PER_USER);
}
