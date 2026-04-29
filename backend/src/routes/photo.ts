import crypto from "crypto";
import express from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { db } from "../db/store";
import { requirePairingToken, uploadRateLimit } from "../middleware/security";
import { inkjoyEnabled, inkjoyPublishImage, resolveInkjoyDeviceId } from "../services/inkjoy_client";

/**
 * POST /api/photo/upload
 * Multipart: field `file` (binary), body fields: filename, device_id, checksum, size
 * As described in `ra/api/Image_Processing_API_Integration.md` step 6.
 */
export function photoRouter(uploadDir: string) {
  const router = express.Router();
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
      const inkjoyAutoPublish = String(process.env.INKJOY_AUTO_PUBLISH ?? "").toLowerCase() === "true";
      const inkjoyDeviceId = resolveInkjoyDeviceId(deviceId);
      let inkjoyResult: unknown = null;
      let inkjoyError: string | null = null;
      let deliveredToFrame = false;
      let deliveryMode = "stored_only";

      if (inkjoyEnabled() && inkjoyAutoPublish && inkjoyDeviceId) {
        try {
          inkjoyResult = await inkjoyPublishImage({
            deviceId: inkjoyDeviceId,
            filename: file.originalname || "upload.jpg",
            bytes: buf,
          });
          deliveredToFrame = true;
          deliveryMode = "inkjoy_cloud";
        } catch (e) {
          inkjoyError = e instanceof Error ? e.message : "inkjoy_publish_failed";
          deliveryMode = "inkjoy_cloud_failed";
        }
      }
      const now = Date.now();
      db.mutate((draft) => {
        draft.device.connected = true;
        draft.device.transport.wifi = transport === "wifi" || draft.device.transport.wifi;
        draft.device.transport.bluetooth = transport === "bluetooth" || draft.device.transport.bluetooth;
        draft.device.lastPhotoAtMs = now;
        draft.device.photoCount += 1;
        draft.device.usedBytes += buf.length;
        if (deviceId) {
          draft.device.id = deviceId;
          draft.device.name = `${deviceId} Connected`;
        }
        draft.uploads.unshift({
          id: `${now}-${Math.random().toString(16).slice(2, 8)}`,
          filename: path.basename(file.path),
          bytes: buf.length,
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
        stored_path: path.basename(file.path),
        device_id: deviceId || "unknown",
        checksum_sha256: sha256,
        client_checksum: clientChecksum || null,
        matches_declared_size: declaredSize === buf.length,
        slideshow_style: slideshowStyle || null,
        transport: transport || null,
        delivered_to_frame: deliveredToFrame,
        delivery_mode: deliveryMode,
        inkjoy: inkjoyEnabled()
          ? {
              auto_publish: inkjoyAutoPublish,
              device_id: inkjoyDeviceId || null,
              ok: inkjoyError == null,
              error: inkjoyError,
              result: inkjoyResult,
            }
          : null,
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
