import crypto from "crypto";

import type { MyframeDb } from "../db/store";

export const USER_GALLERY_MAX_PER_USER = 20;

export type UserGalleryPhoto = {
  id: string;
  userId: string;
  previewFilename: string;
  atMs: number;
  deviceId?: string;
};

export function ensureUserGalleryPhotos(draft: MyframeDb): void {
  if (!Array.isArray(draft.userGalleryPhotos)) {
    draft.userGalleryPhotos = [];
  }
}

export function registerUserGalleryPhoto(
  draft: MyframeDb,
  userId: string,
  previewFilename: string,
  meta?: { deviceId?: string },
): UserGalleryPhoto {
  ensureUserGalleryPhotos(draft);
  const now = Date.now();
  const entry: UserGalleryPhoto = {
    id: `ug_${now}_${crypto.randomBytes(3).toString("hex")}`,
    userId,
    previewFilename,
    atMs: now,
    deviceId: meta?.deviceId,
  };
  const others = draft.userGalleryPhotos!.filter((p) => p.userId !== userId);
  const mine = draft.userGalleryPhotos!.filter((p) => p.userId === userId);
  const nextMine = [entry, ...mine].slice(0, USER_GALLERY_MAX_PER_USER);
  draft.userGalleryPhotos = [...nextMine, ...others];
  return entry;
}

export function listUserGalleryPhotos(draft: MyframeDb, userId: string): UserGalleryPhoto[] {
  ensureUserGalleryPhotos(draft);
  return draft
    .userGalleryPhotos!.filter((p) => p.userId === userId)
    .sort((a, b) => b.atMs - a.atMs)
    .slice(0, USER_GALLERY_MAX_PER_USER);
}
