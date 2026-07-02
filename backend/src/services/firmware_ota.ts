import path from "path";

import { frameMediaPlayEndpoint, normalizedFrameMediaBaseUrl } from "../config/frame_media";
import { db } from "../db/store";
import {
  isFirmwareVersionNewer,
  latestFirmwareRelease,
  normalizeFirmwareVersion,
} from "../data/firmware_releases";
import { getFrame, normalizeMac, publishOta, resolveMqttHardwareMac } from "./frame_mqtt";

type StoredFrame = ReturnType<typeof db.read>["frames"][number];

function esp32BleMacFromWifi(wifiMac: string): string | null {
  const v = Number.parseInt(wifiMac, 16);
  if (!Number.isFinite(v) || v < 0 || v > (1 << 48) - 3) return null;
  return (v + 2).toString(16).toUpperCase().padStart(12, "0");
}

function esp32WifiMacFromBle(bleMac: string): string | null {
  const v = Number.parseInt(bleMac, 16);
  if (!Number.isFinite(v) || v < 2) return null;
  return (v - 2).toString(16).toUpperCase().padStart(12, "0");
}

function macKeyVariants(raw: string): Set<string> {
  const out = new Set<string>();
  const add = (value: string | null | undefined) => {
    if (!value) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    const resolved = resolveMqttHardwareMac(trimmed);
    if (resolved) {
      out.add(resolved);
      const ble = esp32BleMacFromWifi(resolved);
      const wifi = esp32WifiMacFromBle(resolved);
      if (ble) out.add(ble);
      if (wifi) out.add(wifi);
      return;
    }
    out.add(normalizeMac(trimmed));
    out.add(trimmed.toUpperCase());
  };
  add(raw);
  return out;
}

function framesMatchRef(frame: Pick<StoredFrame, "id" | "bleMac">, deviceRef: string): boolean {
  const refKeys = macKeyVariants(deviceRef);
  const frameKeys = macKeyVariants(frame.id);
  for (const key of macKeyVariants(frame.bleMac)) frameKeys.add(key);
  for (const ref of refKeys) {
    if (frameKeys.has(ref)) return true;
  }
  return frame.id.trim() === deviceRef.trim();
}

function findVisibleFrame(deviceRef: string, visibleFrameIds: string[]): StoredFrame | null {
  const visible = new Set(visibleFrameIds);
  const data = db.read();
  const trimmed = deviceRef.trim();
  const exact = data.frames.find((f) => f.id === trimmed && visible.has(f.id));
  if (exact) return exact;
  for (const frame of data.frames) {
    if (!visible.has(frame.id)) continue;
    if (framesMatchRef(frame, deviceRef)) return frame;
  }
  return null;
}

export type FirmwareCheckResult = {
  ok: true;
  deviceId: string;
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseNotes: string;
  sizeBytes: number;
  otaStatus: "idle" | "queued" | "updating" | "failed" | "success";
  otaTargetVersion: string | null;
  frameOnline: boolean;
  mqttConnected: boolean;
};

function firmwarePublicUrl(filename: string): string {
  const base = normalizedFrameMediaBaseUrl();
  const clean = filename.replace(/^\/+/, "");
  if (!base) return `/firmware/${encodeURIComponent(clean)}`;
  return `${base}/firmware/${encodeURIComponent(clean)}`;
}

function liveFirmwareVersion(frameId: string, bleMac: string, stored: string): string {
  const mac = resolveMqttHardwareMac(bleMac) ?? resolveMqttHardwareMac(frameId);
  if (!mac) return stored;
  const live = getFrame(mac);
  const fromMqtt = live?.config?.firmwareVersion;
  if (typeof fromMqtt === "string" && fromMqtt.trim()) {
    return normalizeFirmwareVersion(fromMqtt);
  }
  return stored;
}

export function firmwareCheckForDevice(deviceId: string, visibleFrameIds: string[]): FirmwareCheckResult | { ok: false; error: string } {
  const frame = findVisibleFrame(deviceId, visibleFrameIds);
  if (!frame) {
    return { ok: false, error: "frame_not_found" };
  }

  const latest = latestFirmwareRelease();
  const stored = normalizeFirmwareVersion(frame.firmwareVersion);
  const current = liveFirmwareVersion(frame.id, frame.bleMac, stored);
  const mac = resolveMqttHardwareMac(frame.bleMac) ?? resolveMqttHardwareMac(frame.id);
  const live = mac ? getFrame(mac) : null;
  const frameOnline = live?.status === "online" || (frame.lastSeenAtMs != null && Date.now() - frame.lastSeenAtMs < 15 * 60 * 1000);

  return {
    ok: true,
    deviceId: frame.id,
    currentVersion: current,
    latestVersion: latest.version,
    updateAvailable: isFirmwareVersionNewer(latest.version, current),
    releaseNotes: latest.releaseNotes,
    sizeBytes: latest.sizeBytes,
    otaStatus: frame.ota?.status ?? "idle",
    otaTargetVersion: frame.ota?.targetVersion ?? null,
    frameOnline,
    mqttConnected: live?.status === "online",
  };
}

export async function pushFirmwareOtaToFrameById(
  deviceId: string,
  actorLabel: string,
  visibleFrameIds?: string[],
): Promise<
  | { ok: true; queued: true; targetVersion: string; downloadUrl: string }
  | { ok: false; error: string; message?: string }
> {
  const data = db.read();
  const frame =
    (visibleFrameIds ? findVisibleFrame(deviceId, visibleFrameIds) : null) ??
    data.frames.find((f) => f.id === deviceId) ??
    data.frames.find((f) => framesMatchRef(f, deviceId));
  if (!frame) return { ok: false, error: "frame_not_found" };

  const latest = latestFirmwareRelease();
  const downloadUrl = firmwarePublicUrl(latest.filename);
  const mac = resolveMqttHardwareMac(frame.bleMac) ?? resolveMqttHardwareMac(frame.id);
  if (!mac) return { ok: false, error: "invalid_frame_mac" };

  try {
    const { host, port } = frameMediaPlayEndpoint();
    const firmwarePath = `/firmware/${encodeURIComponent(latest.filename)}`;
    await publishOta({
      mac,
      version: latest.version,
      downloadUrl,
      host,
      port,
      firmwarePath,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "mqtt_publish_failed";
    return { ok: false, error: "ota_publish_failed", message: msg };
  }

  const now = Date.now();
  db.mutate((draft) => {
    draft.frames = draft.frames.map((f) => {
      if (f.id !== frame.id) return f;
      return {
        ...f,
        ota: { targetVersion: latest.version, status: "updating" },
      };
    });
    draft.auditLog.unshift({
      id: `audit_${now}_${Math.random().toString(16).slice(2, 8)}`,
      actor: actorLabel,
      action: "firmware_ota_push",
      target: frame.id,
      atMs: now,
      meta: { version: latest.version, mac },
    });
  });

  return { ok: true, queued: true, targetVersion: latest.version, downloadUrl };
}

export async function triggerFirmwareUpdate(
  deviceId: string,
  visibleFrameIds: string[],
  actorUserId?: string,
): Promise<
  | { ok: true; queued: true; targetVersion: string; downloadUrl: string }
  | { ok: false; error: string; message?: string }
> {
  const check = firmwareCheckForDevice(deviceId, visibleFrameIds);
  if (!check.ok) return check;
  if (!check.updateAvailable) {
    return { ok: false, error: "already_up_to_date" };
  }
  if (!check.frameOnline) {
    return { ok: false, error: "frame_offline", message: "Frame must be online on Wi‑Fi to receive the update." };
  }
  return pushFirmwareOtaToFrameById(deviceId, actorUserId ? `user:${actorUserId}` : "user", visibleFrameIds);
}

export function firmwareUploadDir(packageRoot: string, uploadDir: string): string {
  return path.join(uploadDir, "firmware");
}
