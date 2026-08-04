/**
 * Powerful stop after playlist/album delete.
 * Clears server slideshow rotation, MQTT-notifies the frame, then plays a
 * fallback image so the panel does not keep showing deleted playlist content:
 *   1) latest single cast (.bin) for that MAC
 *   2) FRAME_IDLE_PLAY_URL / FRAME_CONNECTED_PLAY_URL env .bin
 */
import path from "path";
import fs from "fs";
import { db } from "../db/store";
import {
  isMqttConnected,
  normalizeMac,
  publishMqttAction,
  publishPlayImage,
  publishStrategyCommand,
  resolveMqttHardwareMac,
} from "./frame_mqtt";

function macKeyVariants(raw: string): string[] {
  const out = new Set<string>();
  const n = normalizeMac(raw);
  if (n) out.add(n);
  const hw = resolveMqttHardwareMac(raw);
  if (hw) out.add(normalizeMac(hw));
  return [...out].filter((k) => k.length >= 8);
}

function frameMacKeys(frame: {
  id: string;
  bleMac: string;
  stationMac?: string | null;
}): string[] {
  const keys = new Set<string>();
  for (const raw of [frame.id, frame.bleMac, frame.stationMac ?? ""]) {
    if (!raw) continue;
    for (const k of macKeyVariants(String(raw))) keys.add(k);
  }
  return [...keys];
}

function deviceMatchesMac(deviceId: string, macKeys: Set<string>): boolean {
  const d = String(deviceId || "").trim();
  if (!d) return false;
  if (macKeys.has(d) || macKeys.has(normalizeMac(d))) return true;
  for (const k of macKeyVariants(d)) {
    if (macKeys.has(k)) return true;
  }
  return false;
}

/** Expand playlist photoIds to upload id + filename tokens used in slideshows. */
export function mediaTokensFromIds(photoIds: string[]): Set<string> {
  const tokens = new Set<string>();
  const data = db.read();
  for (const raw of photoIds) {
    const id = String(raw || "").trim();
    if (!id) continue;
    tokens.add(id);
    const base = id.split("/").pop() || id;
    if (base) tokens.add(base);
    const upload = data.uploads.find(
      (u) =>
        u.id === id ||
        u.filename === id ||
        u.filename === base ||
        u.previewFilename === id,
    );
    if (upload) {
      tokens.add(upload.id);
      if (upload.filename) tokens.add(upload.filename);
      if (upload.previewFilename) tokens.add(upload.previewFilename);
      const fnBase = upload.filename?.split("/").pop();
      if (fnBase) tokens.add(fnBase);
    }
  }
  return tokens;
}

function slideshowIntersects(
  imageIds: string[] | undefined,
  tokens: Set<string>,
): boolean {
  if (!imageIds?.length || !tokens.size) return false;
  for (const img of imageIds) {
    const id = String(img || "").trim();
    if (!id) continue;
    if (tokens.has(id)) return true;
    const base = id.split("/").pop() || id;
    if (tokens.has(base)) return true;
  }
  return false;
}

/**
 * Resolve which slideshow MAC keys should stop for a deleted playlist.
 * Union of assigned frames + overlapping slideshows + optional owner frames
 * that currently have an active slideshow (powerful delete).
 */
export function macKeysForDeletedPlaylist(playlist: {
  photoIds?: string[];
  assignedFrameIds?: string[];
  ownerUserId?: string | null;
}): string[] {
  const data = db.read();
  const keys = new Set<string>();
  const tokens = mediaTokensFromIds(playlist.photoIds ?? []);

  for (const fid of playlist.assignedFrameIds ?? []) {
    const frame = data.frames.find(
      (f) => f.id === fid || normalizeMac(f.bleMac) === normalizeMac(fid),
    );
    if (frame) {
      for (const k of frameMacKeys(frame)) keys.add(k);
    } else {
      for (const k of macKeyVariants(fid)) keys.add(k);
    }
  }

  const slides = data.slideshowsByBleMac || {};
  for (const [macKey, slide] of Object.entries(slides)) {
    if (slideshowIntersects(slide?.imageIds, tokens)) {
      keys.add(macKey);
      for (const k of macKeyVariants(macKey)) keys.add(k);
    }
  }

  // Powerful delete: if still no MACs but owner has frames with active slideshows,
  // stop those too (covers local album ids that never set assignedFrameIds).
  if (!keys.size && playlist.ownerUserId) {
    const ownerFrames = data.frames.filter(
      (f) => f.ownerUserId === playlist.ownerUserId,
    );
    for (const frame of ownerFrames) {
      const fkeys = frameMacKeys(frame);
      const hasSlide = fkeys.some((k) => {
        const s = slides[k] || slides[normalizeMac(k)];
        return !!(s && s.imageIds && s.imageIds.length);
      });
      if (hasSlide) {
        for (const k of fkeys) keys.add(k);
      }
    }
  }

  return [...keys];
}

/** Clear server slideshow row(s) for MAC key variants. */
export function clearSlideshowEntries(macKeys: string[]): string[] {
  const cleared = new Set<string>();
  if (!macKeys.length) return [];
  const want = new Set<string>();
  for (const k of macKeys) {
    for (const v of macKeyVariants(k)) want.add(v);
    want.add(k);
  }
  db.mutate((draft) => {
    if (!draft.slideshowsByBleMac) return;
    for (const key of Object.keys(draft.slideshowsByBleMac)) {
      if (!want.has(key) && !want.has(normalizeMac(key))) continue;
      delete draft.slideshowsByBleMac[key];
      cleared.add(key);
    }
  });
  return [...cleared];
}

function publicBinUrl(filename: string): string | null {
  const base = String(
    process.env.PUBLIC_MEDIA_BASE_URL || process.env.PUBLIC_BASE_URL || "",
  ).replace(/\/$/, "");
  const name = path.basename(String(filename || "").trim());
  if (!name.toLowerCase().endsWith(".bin")) return null;
  const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || "uploads");
  const disk = path.join(uploadDir, name);
  if (!fs.existsSync(disk)) return null;
  const rel = `/frame-media/${encodeURIComponent(name)}`;
  return base ? `${base}${rel}` : rel;
}

/**
 * Prefer last single cast for this MAC (not slideshow/gallery_sync).
 * Exclude playlist tokens so we don't "fall back" to a deleted playlist image.
 */
export function resolveFallbackPlayUrl(
  macRaw: string,
  excludeTokens?: Set<string>,
): string | null {
  const mac = resolveMqttHardwareMac(macRaw) ?? normalizeMac(macRaw);
  if (!mac) return null;
  const macKeys = new Set(macKeyVariants(mac));
  const data = db.read();
  const exclude = excludeTokens || new Set<string>();

  const singles = data.uploads
    .filter((u) => {
      if (!deviceMatchesMac(u.deviceId, macKeys)) return false;
      const fn = String(u.filename || "");
      if (!fn.toLowerCase().endsWith(".bin")) return false;
      const mode = String(u.deliveryMode || "");
      if (mode === "gallery_sync" || mode === "slideshow") return false;
      // Prefer actual plays; allow stored_only .bin as last resort.
      const base = fn.split("/").pop() || fn;
      if (exclude.has(u.id) || exclude.has(fn) || exclude.has(base)) return false;
      return true;
    })
    .sort((a, b) => b.atMs - a.atMs);

  for (const u of singles) {
    // Prefer ones that were delivered / mqtt-played.
    if (u.deliveredToFrame || u.deliveryMode === "vps_mqtt" || u.deliveryMode === "mqtt") {
      const url = publicBinUrl(u.filename);
      if (url) return url;
    }
  }
  for (const u of singles) {
    const url = publicBinUrl(u.filename);
    if (url) return url;
  }

  const envIdle = String(
    process.env.FRAME_IDLE_PLAY_URL || process.env.FRAME_CONNECTED_PLAY_URL || "",
  ).trim();
  if (envIdle) return envIdle;

  // Last resort: any .bin named like connected/idle/default in uploads.
  try {
    const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || "uploads");
    const files = fs.readdirSync(uploadDir);
    const hit = files.find((f) =>
      /^(connected|idle|default|welcome|logo).*\.bin$/i.test(f),
    );
    if (hit) return publicBinUrl(hit);
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Notify the frame to stop playlist playback and show a fallback image.
 */
export async function notifyFrameStopPlayback(
  macRaw: string,
  options?: { excludeTokens?: Set<string>; playFallback?: boolean },
): Promise<{ fallbackUrl: string | null }> {
  const mac = resolveMqttHardwareMac(macRaw) ?? normalizeMac(macRaw);
  if (!mac || !isMqttConnected()) return { fallbackUrl: null };

  await publishMqttAction(mac, "stop").catch((err) => {
    console.warn("[slideshow-stop] stop action failed", mac, err);
  });

  await publishStrategyCommand(mac, {
    strategy: 1,
    intervalMinutes: 60 * 24 * 365,
    begintime: "",
    endtime: "",
    idle: 1,
  }).catch((err) => {
    console.warn("[slideshow-stop] strategy idle failed", mac, err);
  });

  const playFallback = options?.playFallback !== false;
  let fallbackUrl: string | null = null;
  if (playFallback) {
    fallbackUrl = resolveFallbackPlayUrl(mac, options?.excludeTokens);
    if (fallbackUrl) {
      await publishPlayImage(mac, fallbackUrl).catch((err) => {
        console.warn("[slideshow-stop] fallback play failed", mac, err);
        fallbackUrl = null;
      });
    } else {
      console.warn("[slideshow-stop] no fallback .bin for", mac);
    }
  }
  return { fallbackUrl };
}

/** Clear slideshow DB state and MQTT-notify each affected MAC (with fallback play). */
export async function stopPlaybackForMacKeys(
  macKeys: string[],
  options?: { excludeTokens?: Set<string>; playFallback?: boolean },
): Promise<{
  cleared: string[];
  notified: string[];
  fallbackUrls: Record<string, string | null>;
}> {
  const unique = [
    ...new Set(macKeys.map((k) => normalizeMac(k) || k).filter(Boolean)),
  ];
  const cleared = clearSlideshowEntries(unique);
  const notified: string[] = [];
  const fallbackUrls: Record<string, string | null> = {};
  for (const key of unique) {
    try {
      const r = await notifyFrameStopPlayback(key, options);
      notified.push(key);
      fallbackUrls[key] = r.fallbackUrl;
    } catch (err) {
      console.warn("[slideshow-stop] notify failed", key, err);
    }
  }
  return { cleared, notified, fallbackUrls };
}

/** Stop frames that were playing a deleted playlist/album (powerful). */
export async function stopPlaybackForDeletedPlaylist(playlist: {
  photoIds?: string[];
  assignedFrameIds?: string[];
  ownerUserId?: string | null;
}): Promise<{
  cleared: string[];
  notified: string[];
  fallbackUrls: Record<string, string | null>;
}> {
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
export async function stopPlaybackIfSlideshowEmpty(
  macKeysTouched: string[],
): Promise<void> {
  const data = db.read();
  const slides = data.slideshowsByBleMac || {};
  const toStop: string[] = [];
  for (const key of macKeysTouched) {
    const n = normalizeMac(key) || key;
    const s = slides[key] || slides[n];
    if (!s || !s.imageIds?.length) {
      toStop.push(key);
    }
  }
  if (toStop.length) await stopPlaybackForMacKeys(toStop, { playFallback: true });
}
