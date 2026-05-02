import crypto from "crypto";
import express from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { db } from "../db/store";
import { requirePairingToken, uploadRateLimit } from "../middleware/security";
import { isMqttConnected, publishPlayImage, resolveMqttHardwareMac } from "../services/frame_mqtt";
import { isProbablyMyfmBuffer, writeMyfmSidecar } from "../services/myfm_encode";

/**
 * POST /api/photo/upload
 * Multipart: field `file` (binary), body fields: filename, device_id, checksum, size
 * As described in `ra/api/Image_Processing_API_Integration.md` step 6.
 */
export function photoRouter(uploadDir: string, publicBaseUrl: string) {
  const router = express.Router();
  const base = publicBaseUrl.replace(/\/$/, "");
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      const name = `${Date.now()}_${safe || "upload.bin"}`;
      cb(null, name);
    },
  });
  const upload = multer({
    storage,
    limits: { fileSize: 15 * 1024 * 1024 },
  });

  router.post("/photo/upload", requirePairingToken, uploadRateLimit, upload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ ok: false, error: "missing_file" });
        return;
      }

      const deviceId = String(req.body.device_id ?? "");
      const clientChecksum = String(req.body.checksum ?? "");
      const declaredSize = Number(req.body.size ?? file.size);
      const slideshowStyle = String(req.body.slideshow_style ?? "").trim();
      const transport = String(req.body.transport ?? "").trim();

      const buf = fs.readFileSync(file.path);
      const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
      const basename = path.basename(file.path);
      const ext = path.extname(basename).toLowerCase();
      const encodeMyfm = String(process.env.FRAME_MYFM_ENCODE ?? "1").trim() !== "0";
      const looksLikeRaster =
        [".jpg", ".jpeg", ".png", ".webp"].includes(ext) || (buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8);

      let mqttBasename = basename;
      if (isProbablyMyfmBuffer(buf)) {
        mqttBasename = basename;
      } else if (encodeMyfm && looksLikeRaster) {
        try {
          mqttBasename = await writeMyfmSidecar(file.path);
        } catch (err) {
          console.warn("[photo] MYFM encode failed, MQTT will use original file:", err);
        }
      }

      const imageUrl = `${base}/frame-media/${encodeURIComponent(mqttBasename)}`;
      let extraStoredBytes = 0;
      if (mqttBasename !== basename) {
        try {
          extraStoredBytes = fs.statSync(path.join(uploadDir, mqttBasename)).size;
        } catch {
          /* ignore */
        }
      }

      let deliveredToFrame = false;
      let deliveryMode = "stored_only";
      const mqttMac = resolveMqttHardwareMac(deviceId);
      if (mqttMac) {
        if (!isMqttConnected()) {
          deliveryMode = "mqtt_disconnected";
        } else {
          let publicHost = "";
          try {
            publicHost = new URL(base).hostname;
          } catch {
            /* ignore */
          }
          void publishPlayImage(deviceId, imageUrl, publicHost || undefined).catch((err) => {
            console.error("[photo] MQTT publish (async):", err);
          });
          deliveredToFrame = true;
          deliveryMode = "vps_mqtt";
        }
      }

      const now = Date.now();
      db.mutate((draft) => {
        draft.device.connected = true;
        draft.device.transport.wifi = transport === "wifi" || draft.device.transport.wifi;
        draft.device.transport.bluetooth = transport === "bluetooth" || draft.device.transport.bluetooth;
        draft.device.lastPhotoAtMs = now;
        draft.device.photoCount += 1;
        draft.device.usedBytes += buf.length + extraStoredBytes;
        if (deviceId) {
          draft.device.id = deviceId;
          draft.device.name = `${deviceId} Connected`;
        }
        draft.uploads.unshift({
          id: `${now}-${Math.random().toString(16).slice(2, 8)}`,
          filename: basename,
          bytes: buf.length + extraStoredBytes,
          deviceId: deviceId || draft.device.id,
          atMs: now,
          checksumSha256: sha256,
          deliveredToFrame,
          deliveryMode,
          deliveryCheckedAtMs: now,
        });
        if (draft.uploads.length > 2000) {
          draft.uploads = draft.uploads.slice(0, 2000);
        }
      });

      res.json({
        ok: true,
        received_bytes: buf.length,
        declared_size: declaredSize,
        stored_path: basename,
        frame_play_basename: mqttBasename,
        myfm_sidecar: mqttBasename !== basename,
        device_id: deviceId || "unknown",
        checksum_sha256: sha256,
        client_checksum: clientChecksum || null,
        matches_declared_size: declaredSize === buf.length,
        slideshow_style: slideshowStyle || null,
        transport: transport || null,
        delivered_to_frame: deliveredToFrame,
        delivery_mode: deliveryMode,
        image_url: imageUrl,
      });
    } catch (e) {
      res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : "upload_failed",
      });
    }
  });

  router.get("/photo/delivery-status", requirePairingToken, (req, res) => {
    const checksum = String(req.query.checksum ?? "").trim().toLowerCase();
    const deviceId = String(req.query.device_id ?? "").trim();
    if (!checksum) {
      res.status(400).json({ ok: false, error: "missing_checksum" });
      return;
    }
    const data = db.read();
    const match = data.uploads.find(
      (u) => u.checksumSha256.toLowerCase() === checksum && (!deviceId || u.deviceId === deviceId),
    );
    if (!match) {
      res.json({ ok: true, found: false, delivered_to_frame: false, delivery_mode: "unknown" });
      return;
    }
    res.json({
      ok: true,
      found: true,
      upload_id: match.id,
      device_id: match.deviceId,
      delivered_to_frame: match.deliveredToFrame === true,
      delivery_mode: match.deliveryMode ?? "stored_only",
      checked_at_ms: match.deliveryCheckedAtMs ?? match.atMs,
      uploaded_at_ms: match.atMs,
    });
  });

  return router;
}
