import path from "path";

import { frameMediaPlayEndpoint, normalizedFrameMediaBaseUrl } from "../config/frame_media";
import { db } from "../db/store";
import {
  isFirmwareVersionNewer,
  latestFirmwareRelease,
  normalizeFirmwareVersion,
} from "../data/firmware_releases";
import { getFrame, publishOta, resolveMqttHardwareMac } from "./frame_mqtt";

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
  if (!visibleFrameIds.includes(deviceId)) {
    return { ok: false, error: "frame_not_found" };
  }
  const data = db.read();
  const frame = data.frames.find((f) => f.id === deviceId);
  if (!frame) return { ok: false, error: "frame_not_found" };

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
): Promise<
  | { ok: true; queued: true; targetVersion: string; downloadUrl: string }
  | { ok: false; error: string; message?: string }
> {
  const data = db.read();
  const frame = data.frames.find((f) => f.id === deviceId);
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
      if (f.id !== deviceId) return f;
      return {
        ...f,
        ota: { targetVersion: latest.version, status: "updating" },
      };
    });
    draft.auditLog.unshift({
      id: `audit_${now}_${Math.random().toString(16).slice(2, 8)}`,
      actor: actorLabel,
      action: "firmware_ota_push",
      target: deviceId,
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
  return pushFirmwareOtaToFrameById(deviceId, actorUserId ? `user:${actorUserId}` : "user");
}

export function firmwareUploadDir(packageRoot: string, uploadDir: string): string {
  return path.join(uploadDir, "firmware");
}
