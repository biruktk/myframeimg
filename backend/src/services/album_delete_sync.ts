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
 *
 * PROTOCOL COMPLIANCE (STRICT 1-to-1):
 *  - remaining > 0  -> ONLY `strategy_bin` (with resolved imgs manifest)
 *  - remaining == 0 -> ONLY `strategy_stop` (never an empty strategy_bin,
 *                      never a fallback `play`).
 */
import { db } from "../db/store";
import {
  isMqttConnected,
  normalizeMac,
  publishStrategyCommand,
  resolveMqttHardwareMac,
} from "./frame_mqtt";
import {
  macKeysForDeletedPlaylist,
  mediaTokensFromIds,
  stopPlaybackForMacKeys,
} from "./slideshow_stop";
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

/** Resolve an upload URL by id OR filename (the app sends filenames as ids). */
function resolveUploadUrl(
  uploads: { id: string; filename?: string }[],
  id: string,
): string | null {
  const base = String(process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  const baseName = id.split("/").pop() || id;
  const upload =
    uploads.find((u) => u.id === id) ??
    uploads.find((u) => u.filename === id) ??
    uploads.find((u) => u.filename === baseName);
  return upload?.filename
    ? `${base}/frame-media/${encodeURIComponent(upload.filename)}`
    : null;
}

/**
 * Compute the effective remaining list for a frame: the client-supplied
 * `imageIds` (the active list, which may still contain the deleted album's
 * photos) minus the deleted album's photo tokens. Falls back to the frame's
 * current slideshow record if the client list is empty.
 */
function remainingForFrame(
  clientImageIds: string[],
  deletedTokens: Set<string>,
  currentImageIds: string[] | undefined,
): string[] {
  const base =
    clientImageIds.length > 0
      ? clientImageIds
      : currentImageIds && currentImageIds.length > 0
        ? currentImageIds
        : [];
  if (deletedTokens.size === 0) return base;
  const out: string[] = [];
  for (const id of base) {
    const t = String(id || "").trim();
    if (!t) continue;
    const baseName = t.split("/").pop() || t;
    if (deletedTokens.has(t) || deletedTokens.has(baseName)) continue;
    out.push(t);
  }
  return out;
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

  // PROTOCOL COMPLIANCE (STRICT 1-to-1): collapse BLE-mac / station-mac /
  // id variants of the SAME physical frame to ONE hardware MAC so the
  // delete-sync never double-dispatches strategy_bin / strategy_stop.
  const hwMacKeys = new Set<string>();
  for (const k of macKeys) {
    const hw = resolveMqttHardwareMac(k) ?? normalizeMac(k);
    if (hw && hw.length >= 8) hwMacKeys.add(hw);
  }
  const macList = [...hwMacKeys];

  const result: AlbumDeleteSyncResult = {
    macsUpdated: [],
    macsStopped: [],
    emptyFrames: [],
  };
  const now = Date.now();
  const random = isRandomStrategy(playlist.strategy) ? 2 : 1;
  const durationMs =
    playlist.durationHours > 0 ? playlist.durationHours * 3600 * 1000 : 0;
  const endtime = durationMs ? (now + durationMs).toString() : "";
  const deletedTokens = mediaTokensFromIds(playlist.photoIds ?? []);

  db.mutate((draft) => {
    if (!draft.slideshowsByBleMac) draft.slideshowsByBleMac = {};
    for (const rawKey of macList) {
      const key = normalizeMac(rawKey) || rawKey;
      const current = draft.slideshowsByBleMac[key]?.imageIds;
      // PROTOCOL COMPLIANCE (STRICT 1-to-1): an EXPLICITLY EMPTY client
      // remaining list means a full delete — the frame must STOP, never
      // fall back to the current slideshow (that re-dispatch produced a
      // stray `strategy_bin` in the audit).
      const remaining = playlist.imageIds.length === 0
        ? []
        : remainingForFrame(playlist.imageIds, deletedTokens, current);
      if (remaining.length === 0) {
        delete draft.slideshowsByBleMac[key];
        result.emptyFrames.push(key);
        result.macsStopped.push(key);
        continue;
      }
      const startIndex = seedCurrentIndex({
        strategy: random,
        count: remaining.length,
        skipPlay: false,
      });
      draft.slideshowsByBleMac[key] = {
        imageIds: remaining,
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

  // PROTOCOL COMPLIANCE: when nothing remains to play, dispatch ONLY
  // `strategy_stop` (playFallback: false) — never an empty `strategy_bin`,
  // never a fallback `play`.
  if (result.macsStopped.length > 0) {
    void stopPlaybackForMacKeys(result.macsStopped, { playFallback: false })
      .then(() => {
        console.log(
          "[album-delete-sync] strategy_stop dispatched macs=%s",
          result.macsStopped.join(","),
        );
      })
      .catch((err) => {
        console.warn("[album-delete-sync] strategy_stop failed", err);
      });
  }

  for (const key of result.macsUpdated) {
    // Resolve image URLs from the uploads table (by id OR filename).
    const uploads = db.read().uploads;
    const slide = db.read().slideshowsByBleMac?.[key];
    const imageIds = slide?.imageIds ?? [];
    const imageUrls = imageIds
      .map((id) => resolveUploadUrl(uploads, id))
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
