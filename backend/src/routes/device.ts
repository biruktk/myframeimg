import { Router } from "express";
import { db } from "../db/store";

export const deviceRouter = Router();

/** Matches `ra/api` device status shape used by the app. */
deviceRouter.get("/device/status", (_req, res) => {
  const data = db.read();
  const d = data.device;
  const now = Date.now();
  const lastPhotoHours = d.lastPhotoAtMs == null ? null : Math.max(0, Math.floor((now - d.lastPhotoAtMs) / 3600000));
  const uptimeDays = Math.max(0, Math.floor((now - d.startedAtMs) / (24 * 3600000)));
  res.json({
    connected: d.connected,
    deviceId: d.id,
    deviceName: d.name,
    room: d.room,
    lastPhotoHours,
    storageGb: Number((d.usedBytes / 1024 / 1024 / 1024).toFixed(2)),
    photoCount: d.photoCount,
    uptimeDays,
    transport: d.transport,
  });
});

deviceRouter.get("/devices/:id/status", (req, res) => {
  const data = db.read();
  const d = data.device;
  const online = req.params.id === d.id ? d.connected : false;
  res.json({
    device_id: req.params.id,
    online,
    storage_used_mb: Math.round(d.usedBytes / 1024 / 1024),
    photo_count: d.photoCount,
  });
});
