/**
 * ALBUM_DELETE_SYNC — low-power firmware protocol for album deletion.
 *
 * Instead of stopping playback, the client sends the *updated* manifest
 * (remaining image id list) and the frame playback strategy. This module:
 *  1) updates the server manifest (slideshowsByBleMac) for the affected frames
 *  2) MQTT-notifies each frame so it drops the deleted images from its local
 *     flash and continues autonomous local playback (no server push timer).
 *
 * If the updated list is empty (nothing remains to play) we fall back to a
 * clean stop so the panel does not stall on deleted-only content.
 */
import { db } from "../db/store";
import {
  isMqttConnected,
  normalizeMac,
  publishStrategyCommand,
  resolveMqttHardwareMac,
} from "./frame_mqtt";
import { macKeysForDeletedPlaylist } from "./slideshow_stop";
import { isRandomStrategy, seedCurrentIndex } from "./slideshow_index";

export interface AlbumDeleteSyncInput {
  /** Photo ids of the deleted album (used to find affected frames by match). */
  photoIds?: string[];
  assignedFrameIds?: string[];
  ownerUserId?: string | null;
  /** Explicit frame identifier / MAC slugs to target. */
  macSlugs?: string[];
  /** Updated manifest (remaining) image ids the frame should keep. */
  imageIds: string[];
  intervalMinutes: number;
  strategy: number; // 1 sequential, 2 random
  durationHours: number;
}

export interface AlbumDeleteSyncResult {
  macsUpdated: string[];
  macsStopped: string[];
  emptyFrames: string[];
}

function macSlug(raw: string): string {
  const hw = resolveMqttHardwareMac(raw);
  if (hw) return normalizeMac(hw);
  const n = normalizeMac(raw);
  return n && n.length >= 8 ? n : "";
}

/** ALBUM_DELETE_SYNC — update manifests + MQTT-notify frames to continue
 *  autonomous local playback with the remaining image list. */
export function syncSlideshowDelete(
  playlist: AlbumDeleteSyncInput,
): AlbumDeleteSyncResult {
  const macKeys = new Set<string>();
  for (const k of macKeysForDeletedPlaylist({
    photoIds: playlist.photoIds ?? [],
    assignedFrameIds: playlist.assignedFrameIds ?? [],
    ownerUserId: playlist.ownerUserId ?? null,
  })) {
    macKeys.add(k);
  }
  for (const m of playlist.macSlugs ?? []) {
    const mm = macSlug(m);
    if (mm) macKeys.add(mm);
  }
  macKeys.delete("");

  const result: AlbumDeleteSyncResult = {
    macsUpdated: [],
    macsStopped: [],
    emptyFrames: [],
  };
  const now = Date.now();
  const ids = playlist.imageIds;
  const random = isRandomStrategy(playlist.strategy) ? 2 : 1;
  const durationMs =
    playlist.durationHours > 0 ? playlist.durationHours * 3600 * 1000 : 0;
  const endtime = durationMs ? (now + durationMs).toString() : "";
  const startIndex = seedCurrentIndex({
    strategy: random,
    count: ids.length,
    skipPlay: false,
  });

  db.mutate((draft) => {
    if (!draft.slideshowsByBleMac) draft.slideshowsByBleMac = {};
    for (const rawKey of macKeys) {
      const key = normalizeMac(rawKey) || rawKey;
      if (ids.length === 0) {
        delete draft.slideshowsByBleMac[key];
        result.emptyFrames.push(key);
        result.macsStopped.push(key);
        continue;
      }
      draft.slideshowsByBleMac[key] = {
        imageIds: ids,
        intervalMinutes: playlist.intervalMinutes,
        strategy: random,
        begintime: now.toString(),
        endtime,
        idle: 0,
        updatedAtMs: now,
        currentIndex: startIndex,
        nextPlayAtMs: now + playlist.intervalMinutes * 60 * 1000,
      };
      result.macsUpdated.push(key);
    }
  });

  for (const key of result.macsUpdated) {
    // Resolve image URLs from the uploads table
    const uploads = db.read().uploads;
    const imageUrls = playlist.imageIds
      .map((id) => {
        const upload = uploads.find((u) => u.id === id);
        return upload ? `${process.env.PUBLIC_BASE_URL?.replace(/\/$/, "")}/frame-media/${encodeURIComponent(upload.filename)}` : null;
      })
      .filter((url): url is string => url !== null);

    publishStrategyCommand(key, {
      strategy: random,
      intervalMinutes: playlist.intervalMinutes,
      begintime: now.toString(),
      endtime,
      idle: 0,
      imageUrls,
    }).catch((e) => {
      console.warn("[album-delete-sync] mqtt strategy failed", key, e);
    });
  }

  return result;
}