import { Router } from "express";
import { db } from "../db/store";
import { requirePairingToken } from "../middleware/security";
import {
  getFrame,
  isFrameMqttFresh,
  isMqttConnected,
  normalizeMac,
  publishFrameCommand,
  resolveMqttHardwareMac,
} from "../services/frame_mqtt";
import {
  isFirmwareVersionNewer,
  latestFirmwareRelease,
  normalizeFirmwareVersion,
} from "../data/firmware_releases";

export const frameFirmwareRouter = Router();

/** Resolve a MAC (station/ble/id) to a persisted frame row, or undefined. */
function lookupMacInDb(macNorm: string) {
  const data = db.read();
  return data.frames.find(
    (f) =>
      normalizeMac(f.bleMac) === macNorm ||
      normalizeMac(f.id) === macNorm ||
      normalizeMac(f.stationMac ?? "") === macNorm,
  );
}

/**
 * GET /api/frames/:mac/firmware
 * Firmware + OTA availability for a frame (current vs latest version, online state).
 */
frameFirmwareRouter.get("/frames/:mac/firmware", (req, res) => {
  const mac = resolveMqttHardwareMac(String(req.params.mac ?? ""));
  if (!mac) {
    res.status(400).json({ ok: false, error: "invalid_mac" });
    return;
  }
  const dbFrame = lookupMacInDb(mac);
  const live = getFrame(mac);
  const latest = latestFirmwareRelease();

  const fromMqtt = live?.config?.firmwareVersion;
  const current =
    typeof fromMqtt === "string" && fromMqtt.trim()
      ? normalizeFirmwareVersion(fromMqtt)
      : normalizeFirmwareVersion(dbFrame?.firmwareVersion ?? "0.0.1");

  res.json({
    ok: true,
    mac,
    currentVersion: current,
    latestVersion: latest.version,
    hasUpdate: isFirmwareVersionNewer(latest.version, current),
    releaseNotes: latest.releaseNotes,
    changelogZh: latest.changelogZh,
    changelogEn: latest.changelogEn,
    sizeBytes: latest.sizeBytes,
    downloadUrl: latest.downloadUrl,
    frameOnline: isFrameMqttFresh(mac),
    otaStatus: dbFrame?.ota?.status ?? "idle",
    otaTargetVersion: dbFrame?.ota?.targetVersion ?? null,
  });
});

/**
 * POST /api/frames/:mac/firmware/update
 * Trigger an OTA firmware update. Validates the frame is online (heartbeat < 15 min)
 * then publishes the strict C5 OTA payload to /myframe/{MAC}.
 */
frameFirmwareRouter.post("/frames/:mac/firmware/update", requirePairingToken, async (req, res) => {
  const mac = resolveMqttHardwareMac(String(req.params.mac ?? ""));
  if (!mac) {
    res.status(400).json({ ok: false, error: "invalid_mac" });
    return;
  }

  // Frame must be online to receive the OTA downlink.
  if (!isFrameMqttFresh(mac)) {
    res.status(409).json({
      ok: false,
      error: "FRAME_OFFLINE",
      message: "Frame must be online to update.",
    });
    return;
  }
  if (!isMqttConnected()) {
    res.status(503).json({ ok: false, error: "mqtt_not_connected" });
    return;
  }

  const latest = latestFirmwareRelease();
  const live = getFrame(mac);
  const fromMqtt = live?.config?.firmwareVersion;
  const current =
    typeof fromMqtt === "string" && fromMqtt.trim()
      ? normalizeFirmwareVersion(fromMqtt)
      : normalizeFirmwareVersion("0.0.0");

  if (!isFirmwareVersionNewer(latest.version, current)) {
    res.json({ ok: false, error: "already_up_to_date", currentVersion: current, latestVersion: latest.version });
    return;
  }

  const msgid = Date.now().toString();
  try {
    await publishFrameCommand(
      mac,
      "ota",
      {
        version: latest.version,
        host: latest.host,
        port: latest.port,
        path: latest.path,
        url: latest.downloadUrl,
      },
      msgid,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "mqtt_publish_failed";
    res.status(502).json({ ok: false, error: "ota_publish_failed", message });
    return;
  }

  db.mutate((draft) => {
    const f = draft.frames.find(
      (x) =>
        normalizeMac(x.bleMac) === mac ||
        normalizeMac(x.id) === mac ||
        normalizeMac(x.stationMac ?? "") === mac,
    );
    if (f) {
      f.ota = { targetVersion: latest.version, status: "downloading" };
      f.lastOtaProgress = 0;
    }
  });

  res.json({ ok: true, message: "OTA update initiated", targetVersion: latest.version, msgid });
});

/**
 * POST /api/frames/:mac/auto-update
 * Persist the user's auto-update preference for this frame.
 */
frameFirmwareRouter.post("/frames/:mac/auto-update", requirePairingToken, (req, res) => {
  const mac = resolveMqttHardwareMac(String(req.params.mac ?? ""));
  if (!mac) {
    res.status(400).json({ ok: false, error: "invalid_mac" });
    return;
  }
  const enabled = req.body?.enabled === true || String(req.body?.enabled ?? "").trim() === "true";
  let frameUpdated = false;
  db.mutate((draft) => {
    const f = draft.frames.find(
      (x) =>
        normalizeMac(x.bleMac) === mac ||
        normalizeMac(x.id) === mac ||
        normalizeMac(x.stationMac ?? "") === mac,
    );
    if (f) {
      frameUpdated = true;
      f.autoUpdateEnabled = enabled;
    }
  });
  res.json({ ok: true, enabled, frameUpdated });
});
