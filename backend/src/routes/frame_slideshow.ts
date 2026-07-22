import express, { Request, Response, Router } from "express";
import { db } from "../db/store";
import { verifyUserJwtBearer } from "../services/app_user_jwt";

/** Strip separators from MAC/device id segments for lookup keys */
function normalizeMacKey(raw: string): string {
  try {
    return decodeURIComponent(raw).replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  } catch {
    return raw.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  }
}

export function frameSlideshowRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: "512kb" }));

/** POST /api/frames/:mac/slideshow */
router.post("/frames/:mac/slideshow", (req: Request, res: Response) => {
  const u = verifyUserJwtBearer(req);
  if (!u) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  const macKey = normalizeMacKey(String(req.params.mac ?? ""));
  if (macKey.length < 8) {
    res.status(400).json({ ok: false, error: "invalid_mac", message: "MAC / device identifier too short" });
    return;
  }

  const body = req.body as { imageIds?: unknown; intervalMinutes?: unknown };
  const rawIds = body.imageIds;
  const ids = Array.isArray(rawIds) ? rawIds.map((x) => String(x ?? "").trim()).filter((x) => x.length > 0) : [];
  const intervalMinutes = Math.round(Number(body.intervalMinutes));

  if (intervalMinutes < 1 || !isFinite(intervalMinutes)) {
    res.status(422).json({
      ok: false,
      error: "invalid_interval",
      message: "intervalMinutes must be at least 1",
      fields: [{ field: "intervalMinutes", message: "Provide interval in minutes (min 1)" }],
    });
    return;
  }
  if (ids.length === 0) {
    res.status(422).json({
      ok: false,
      error: "validation_error",
      message: "imageIds cannot be empty",
      fields: [{ field: "imageIds", message: "Provide at least one image id" }],
    });
    return;
  }

  const now = Date.now();
  db.mutate((draft) => {
    if (!draft.slideshowsByBleMac) draft.slideshowsByBleMac = {};
    draft.slideshowsByBleMac[macKey] = {
      imageIds: ids,
      intervalMinutes,
      updatedAtMs: now,
      currentIndex: 0,
      nextPlayAtMs: now,
    };
  });

  res.json({ ok: true, macKey, imageIds: ids, intervalMinutes });
});

  return router;
}
