/**
 * Stop frame slideshow playback after an account playlist/album (or media)
 * delete. Clears server rotation state and MQTT-notifies the device.
 *
 * Client requirement: delete in App → sync via server → notify frame →
 * stop playing that content immediately.
 */
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

function frameMacKeys(
  frame: {
    id: string;
    bleMac: string;
    stationMac?: string | null;
  },
): string[] {
  const keys = new Set<string>();
  for (const raw of [frame.id, frame.bleMac, frame.stationMac ?? ""]) {
    if (!raw) continue;
    for (const k of macKeyVariants(String(raw))) keys.add(k);
  }
  return [...keys];
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
      (u) => u.id === id || u.filename === id || u.filename === base || u.previewFilename === id,
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
 * Union of assigned frames + any MAC whose active slideshow overlaps photoIds.
 */
export function macKeysForDeletedPlaylist(playlist: {
  photoIds?: string[];
  assignedFrameIds?: string[];
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

/**
 * Notify the frame to stop playlist playback.
 * 1) MQTT action "stop" (client-required notification)
 * 2) strategy idle=1 to halt auto-rotation schedule
 * 3) optional FRAME_IDLE_PLAY_URL .bin play to replace on-screen content
 */
export async function notifyFrameStopPlayback(macRaw: string): Promise<void> {
  const mac = resolveMqttHardwareMac(macRaw) ?? normalizeMac(macRaw);
  if (!mac || !isMqttConnected()) return;

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

  const idleUrl = String(process.env.FRAME_IDLE_PLAY_URL || "").trim();
  if (idleUrl) {
    await publishPlayImage(mac, idleUrl).catch((err) => {
      console.warn("[slideshow-stop] idle play failed", mac, err);
    });
  }
}

/** Clear slideshow DB state and MQTT-notify each affected MAC. */
export async function stopPlaybackForMacKeys(macKeys: string[]): Promise<{
  cleared: string[];
  notified: string[];
}> {
  const unique = [...new Set(macKeys.map((k) => normalizeMac(k) || k).filter(Boolean))];
  const cleared = clearSlideshowEntries(unique);
  const notified: string[] = [];
  for (const key of unique) {
    try {
      await notifyFrameStopPlayback(key);
      notified.push(key);
    } catch (err) {
      console.warn("[slideshow-stop] notify failed", key, err);
    }
  }
  return { cleared, notified };
}

/** Stop frames that were playing a deleted playlist/album. */
export async function stopPlaybackForDeletedPlaylist(playlist: {
  photoIds?: string[];
  assignedFrameIds?: string[];
}): Promise<{ cleared: string[]; notified: string[] }> {
  const macKeys = macKeysForDeletedPlaylist(playlist);
  return stopPlaybackForMacKeys(macKeys);
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
  if (toStop.length) await stopPlaybackForMacKeys(toStop);
}
