import crypto from "crypto";
import express from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { db } from "../db/store";
import { requirePairingToken, uploadRateLimit } from "../middleware/security";
import { isMqttConnected, publishPlayImage, resolveMqttHardwareMac } from "../services/frame_mqtt";
import {
  assertXt13e6Bin,
  isProbablyMyfmBuffer,
  storeClientXtBin,
  writeMyfmSidecar,
  XT_BIN_TOTAL_BYTES,
} from "../services/myfm_encode";

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
      let imageProcessing: "client_passthrough" | "server_myfm_encode" | "stored_raw" = "stored_raw";

      if (isProbablyMyfmBuffer(buf)) {
        assertXt13e6Bin(buf);
        mqttBasename = await storeClientXtBin(buf, uploadDir, basename);
        imageProcessing = "client_passthrough";
      } else if (ext === ".bin") {
        res.status(400).json({
          ok: false,
          error: "invalid_xt_bin",
          message: `Upload must be exactly ${XT_BIN_TOTAL_BYTES} bytes with header 04 B0 06 40, or send JPEG/PNG for server encode.`,
          received_bytes: buf.length,
        });
        return;
      } else if (encodeMyfm && looksLikeRaster) {
        try {
          mqttBasename = await writeMyfmSidecar(file.path);
          imageProcessing = "server_myfm_encode";
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          console.error("[photo] MYFM encode failed:", detail);
          res.status(503).json({
            ok: false,
            error: "myfm_encode_failed",
            message: detail,
            hint:
              "XT ePaper / ESP32 only renders MYFM .bin. Fix sharp/libvips on the server, ensure FRAME_MYFM_ENCODE=1, and rebuild. JPEG/PNG is never sent to MQTT.",
          });
          return;
        }
      }

      const imageUrl = `${base}/frame-media/${encodeURIComponent(mqttBasename)}`;

      /** JPEG/PNG raster kept beside `.bin`; MYFM `.bin` is MQTT target; both counted for quota when present. */
      let persistedDiskBytes = buf.length;
      let jpegBackupStoredPath: string | null = null;
      if (
        mqttBasename !== basename &&
        mqttBasename.toLowerCase().endsWith(".bin") &&
        path.extname(basename).toLowerCase() !== ".bin" &&
        fs.existsSync(file.path)
      ) {
        jpegBackupStoredPath = basename;
        try {
          const binSz = fs.statSync(path.join(uploadDir, mqttBasename)).size;
          persistedDiskBytes = buf.length + binSz;
        } catch {
          persistedDiskBytes = buf.length;
        }
      }

      const playbackMyfmBin = mqttBasename.toLowerCase().endsWith(".bin");

      let deliveredToFrame = false;
      let deliveryMode = "stored_only";
      const mqttMac = resolveMqttHardwareMac(deviceId);
      if (mqttMac) {
        if (!isMqttConnected()) {
          deliveryMode = "mqtt_disconnected";
        } else {
          let publicHost = "";
          try {
            publicHost = new URL(process.env.PUBLIC_MEDIA_BASE_URL || base).hostname;
          } catch {
            /* ignore */
          }
          try {
            await publishPlayImage(deviceId, imageUrl, publicHost || undefined);
            deliveredToFrame = true;
            deliveryMode = "vps_mqtt";
          } catch (err) {
            console.error("[photo] MQTT play publish failed:", err);
            deliveryMode = "mqtt_publish_failed";
          }
        }
      }

      const now = Date.now();
      db.mutate((draft) => {
        draft.device.connected = true;
        draft.device.transport.wifi = transport === "wifi" || draft.device.transport.wifi;
        draft.device.transport.bluetooth = transport === "bluetooth" || draft.device.transport.bluetooth;
        draft.device.lastPhotoAtMs = now;
        draft.device.photoCount += 1;
        draft.device.usedBytes += persistedDiskBytes;
        if (deviceId) {
          draft.device.id = deviceId;
          draft.device.name = `${deviceId} Connected`;
        }
        draft.frames = draft.frames.map((f) => {
          if (f.id !== (deviceId || draft.device.id)) return f;
          return {
            ...f,
            lastSeenAtMs: now,
            wifiStatus: transport === "wifi" ? "online" : f.wifiStatus,
          };
        });
        draft.uploads.unshift({
          id: `${now}-${Math.random().toString(16).slice(2, 8)}`,
          filename: mqttBasename,
          bytes: persistedDiskBytes,
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
        draft.auditLog.unshift({
          id: `audit_${now}_${Math.random().toString(16).slice(2, 8)}`,
          actor: "api_upload",
          action: "photo_uploaded",
          target: deviceId || draft.device.id,
          atMs: now,
          meta: {
            filename: mqttBasename,
            bytes: persistedDiskBytes,
            deliveredToFrame,
            deliveryMode,
          },
        });
      });

      res.json({
        ok: true,
        received_bytes: buf.length,
        declared_size: declaredSize,
        /** MYFM basename used in MQTT (`image_url`). */
        stored_path: mqttBasename,
        frame_play_basename: mqttBasename,
        /** Original JPEG/PNG kept next to `.bin` for preview/debug (not in MQTT). */
        preview_stored_path: jpegBackupStoredPath,
        /** True when playback is MYFM `.bin`. */
        myfm_sidecar: playbackMyfmBin,
        /** Expect 960004 for official 1200×1600 XT 13.3E6 `.bin`. */
        myfm_file_bytes:
          playbackMyfmBin && fs.existsSync(path.join(uploadDir, mqttBasename))
            ? fs.statSync(path.join(uploadDir, mqttBasename)).size
            : null,
        device_id: deviceId || "unknown",
        checksum_sha256: sha256,
        client_checksum: clientChecksum || null,
        matches_declared_size: declaredSize === buf.length,
        slideshow_style: slideshowStyle || null,
        transport: transport || null,
        delivered_to_frame: deliveredToFrame,
        delivery_mode: deliveryMode,
        image_url: imageUrl,
        /** `client_passthrough` = exact bytes from iOS/Flutter `.bin`; never re-dithered on VPS. */
        image_processing: imageProcessing,
      });
    } catch (e) {
      res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : "upload_failed",
      });
    }
  });

  router.post("/frames/:mac/upload", requirePairingToken, uploadRateLimit, upload.single("photo"), async (req, res) => {
    const mac = resolveMqttHardwareMac(String(req.params.mac ?? ""));
    if (!mac) {
      res.status(400).json({ ok: false, error: "invalid_mac" });
      return;
    }
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ ok: false, error: "missing_photo" });
        return;
      }
      const deviceId = mac;
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
      let imageProcessing: "client_passthrough" | "server_myfm_encode" | "stored_raw" = "stored_raw";

      if (isProbablyMyfmBuffer(buf)) {
        assertXt13e6Bin(buf);
        mqttBasename = await storeClientXtBin(buf, uploadDir, basename);
        imageProcessing = "client_passthrough";
      } else if (ext === ".bin") {
        res.status(400).json({
          ok: false,
          error: "invalid_xt_bin",
          message: `Upload must be exactly ${XT_BIN_TOTAL_BYTES} bytes with header 04 B0 06 40, or send JPEG/PNG for server encode.`,
          received_bytes: buf.length,
        });
        return;
      } else if (encodeMyfm && looksLikeRaster) {
        try {
          mqttBasename = await writeMyfmSidecar(file.path);
          imageProcessing = "server_myfm_encode";
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          console.error("[photo] MYFM encode failed:", detail);
          res.status(503).json({
            ok: false,
            error: "myfm_encode_failed",
            message: detail,
            hint:
              "XT ePaper / ESP32 only renders MYFM .bin. Fix sharp/libvips on the server, ensure FRAME_MYFM_ENCODE=1, and rebuild. JPEG/PNG is never sent to MQTT.",
          });
          return;
        }
      }

      const imageUrl = `${base}/frame-media/${encodeURIComponent(mqttBasename)}`;

      let persistedDiskBytes = buf.length;
      let jpegBackupStoredPath: string | null = null;
      if (
        mqttBasename !== basename &&
        mqttBasename.toLowerCase().endsWith(".bin") &&
        path.extname(basename).toLowerCase() !== ".bin" &&
        fs.existsSync(file.path)
      ) {
        jpegBackupStoredPath = basename;
        try {
          const binSz = fs.statSync(path.join(uploadDir, mqttBasename)).size;
          persistedDiskBytes = buf.length + binSz;
        } catch {
          persistedDiskBytes = buf.length;
        }
      }

      const playbackMyfmBin = mqttBasename.toLowerCase().endsWith(".bin");

      let deliveredToFrame = false;
      let deliveryMode = "stored_only";
      const mqttMac = resolveMqttHardwareMac(deviceId);
      if (mqttMac) {
        if (!isMqttConnected()) {
          deliveryMode = "mqtt_disconnected";
        } else {
          let publicHost = "";
          try {
            publicHost = new URL(process.env.PUBLIC_MEDIA_BASE_URL || base).hostname;
          } catch {
            /* ignore */
          }
          try {
            await publishPlayImage(deviceId, imageUrl, publicHost || undefined);
            deliveredToFrame = true;
            deliveryMode = "vps_mqtt";
          } catch (err) {
            console.error("[photo] MQTT play publish failed:", err);
            deliveryMode = "mqtt_publish_failed";
          }
        }
      }

      const now = Date.now();
      db.mutate((draft) => {
        draft.device.connected = true;
        draft.device.transport.wifi = transport === "wifi" || draft.device.transport.wifi;
        draft.device.transport.bluetooth = transport === "bluetooth" || draft.device.transport.bluetooth;
        draft.device.lastPhotoAtMs = now;
        draft.device.photoCount += 1;
        draft.device.usedBytes += persistedDiskBytes;
        if (deviceId) {
          draft.device.id = deviceId;
          draft.device.name = `${deviceId} Connected`;
        }
        draft.frames = draft.frames.map((f) => {
          if (f.id !== (deviceId || draft.device.id)) return f;
          return {
            ...f,
            lastSeenAtMs: now,
            wifiStatus: transport === "wifi" ? "online" : f.wifiStatus,
          };
        });
        draft.uploads.unshift({
          id: `${now}-${Math.random().toString(16).slice(2, 8)}`,
          filename: mqttBasename,
          bytes: persistedDiskBytes,
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
        draft.auditLog.unshift({
          id: `audit_${now}_${Math.random().toString(16).slice(2, 8)}`,
          actor: "api_upload",
          action: "photo_uploaded",
          target: deviceId || draft.device.id,
          atMs: now,
          meta: {
            filename: mqttBasename,
            bytes: persistedDiskBytes,
            deliveredToFrame,
            deliveryMode,
          },
        });
      });

      res.json({
        ok: true,
        received_bytes: buf.length,
        declared_size: declaredSize,
        stored_path: mqttBasename,
        frame_play_basename: mqttBasename,
        preview_stored_path: jpegBackupStoredPath,
        myfm_sidecar: playbackMyfmBin,
        myfm_file_bytes:
          playbackMyfmBin && fs.existsSync(path.join(uploadDir, mqttBasename))
            ? fs.statSync(path.join(uploadDir, mqttBasename)).size
            : null,
        device_id: deviceId || "unknown",
        checksum_sha256: sha256,
        client_checksum: clientChecksum || null,
        matches_declared_size: declaredSize === buf.length,
        slideshow_style: slideshowStyle || null,
        transport: transport || null,
        delivered_to_frame: deliveredToFrame,
        delivery_mode: deliveryMode,
        image_url: imageUrl,
        image_processing: imageProcessing,
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
