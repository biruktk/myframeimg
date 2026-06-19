import crypto from "crypto";
import express, { Request, Response, Router } from "express";
import fs from "fs";
import multer from "multer";
import path from "path";

import { normalizedFrameMediaBaseUrl } from "../config/frame_media";
import { db } from "../db/store";
import { verifyUserJwtBearer } from "../services/app_user_jwt";
import {
  listUserGalleryPhotos,
  registerUserGalleryPhoto,
  USER_GALLERY_MAX_PER_USER,
} from "../services/user_gallery_service";

function authUser(req: Request, res: Response) {
  const u = verifyUserJwtBearer(req);
  if (!u) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return null;
  }
  return u;
}

function safeUploadBasename(raw: string): string | null {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  let name = trimmed;
  try {
    if (trimmed.includes("://")) {
      name = decodeURIComponent(path.basename(new URL(trimmed).pathname));
    }
  } catch {
    return null;
  }
  const base = path.basename(name);
  if (!base || base.includes("..") || base.includes("/") || base.includes("\\")) return null;
  return base;
}

function galleryItemJson(
  item: { id: string; previewFilename: string; atMs: number; deviceId?: string },
  mediaBase: string,
) {
  const thumbPath = `/frame-media/${encodeURIComponent(item.previewFilename)}`;
  const base = mediaBase.replace(/\/$/, "");
  return {
    id: item.id,
    atMs: item.atMs,
    deviceId: item.deviceId ?? null,
    previewFilename: item.previewFilename,
    thumbUrl: thumbPath,
    url: `${base}${thumbPath}`,
  };
}

export function userGalleryRouter(uploadDir: string, publicBaseUrl: string): Router {
  const router = Router();
  const mediaBase = normalizedFrameMediaBaseUrl(publicBaseUrl) || publicBaseUrl.replace(/\/$/, "");

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || ".jpg").toLowerCase() || ".jpg";
      const safeExt = [".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg";
      cb(null, `gallery_${Date.now()}_${crypto.randomBytes(4).toString("hex")}${safeExt}`);
    },
  });
  const upload = multer({ storage, limits: { fileSize: 32 * 1024 * 1024 } });

  router.use(express.json({ limit: "64kb" }));

  /** GET /api/user/gallery — last 20 photos for signed-in user (all login providers). */
  router.get("/user/gallery", (req, res) => {
    const auth = authUser(req, res);
    if (!auth) return;
    const data = db.read();
    const photos = listUserGalleryPhotos(data, auth.userId);
    res.json({
      ok: true,
      maxPhotos: USER_GALLERY_MAX_PER_USER,
      photos: photos.map((p) => galleryItemJson(p, mediaBase)),
    });
  });

  /** POST /api/user/gallery — save to account library (optional; frame send also registers via JWT on /photo/upload). */
  router.post("/user/gallery", upload.single("file"), (req, res) => {
    const auth = authUser(req, res);
    if (!auth) return;
    const file = req.file;
    if (!file) {
      res.status(400).json({ ok: false, error: "missing_file" });
      return;
    }
    const storedName = safeUploadBasename(file.filename || path.basename(file.path));
    if (!storedName) {
      res.status(400).json({ ok: false, error: "invalid_uploaded_filename" });
      return;
    }
    const deviceId = String(req.body?.device_id ?? req.body?.deviceId ?? "").trim() || undefined;
    let entry;
    db.mutate((draft) => {
      entry = registerUserGalleryPhoto(draft, auth.userId, storedName, { deviceId });
    });
    res.status(201).json({
      ok: true,
      photo: galleryItemJson(entry!, mediaBase),
    });
  });

  return router;
}
