import express, { Request, Response } from "express";
import { requirePairingToken } from "../middleware/security";
import { db } from "../db/store";
import {
  frameMediaOrigin,
  isDeviceSleeping,
  normalizeMac,
  resolveMqttHardwareMac,
} from "../services/frame_mqtt";
import { enqueuePush, getPushJob, pushStatus } from "../services/push_queue";

/**
 * Async image push queue routes. Mount at /api.
 *
 *   POST /api/v1/frames/:mac/push          { type, imgs?|photoIds? }
 *        -> { success, msgid, status: "queued", progress: 0 }
 *   GET  /api/v1/frames/:mac/push-status?msgid=<msgid>
 *        -> { msgid, status, progress, updatedAt }
 *
 * The push is fully asynchronous: the client gets a msgid immediately and polls
 * push-status to observe queued -> dispatched (0.30) -> downloaded (0.65) ->
 * completed (1.00), or timeout_failed after 45s.
 */
export const pushRouter = express.Router();

function toMac(raw: string): string {
  return resolveMqttHardwareMac(raw) ?? normalizeMac(raw);
}

/** Resolve an imgurl to an absolute frame-media URL (frame-fetchable). */
function resolveImgUrl(imgurl: string): string {
  const url = String(imgurl ?? "").trim();
  if (!url) return url;
  // Absolute URL already — leave as-is.
  if (/^https?:\/\//i.test(url)) return url;
  const media = frameMediaOrigin();
  const base = media.base || `http://${media.host || "47.76.164.162"}:${media.port || 80}`;
  return `${base.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
}

/** Resolve photoIds from the upload store into frame-media imgurls. */
function resolvePhotoIds(photoIds: unknown): Array<{ imgid: string; imgurl: string }> {
  const ids = Array.isArray(photoIds) ? photoIds.map((x) => String(x).trim()) : [];
  const out: Array<{ imgid: string; imgurl: string }> = [];
  const data = db.read();
  const media = frameMediaOrigin();
  const base = media.base || `http://${media.host || "47.76.164.162"}:${media.port || 80}`;
  for (const id of ids) {
    if (!id) continue;
    const upload =
      data.uploads.find((u) => u.id === id) ??
      data.uploads.find((u) => u.filename === id);
    const filename = upload?.filename || id;
    out.push({
      imgid: id,
      imgurl: `${base.replace(/\/$/, "")}/frame-media/${encodeURIComponent(filename)}`,
    });
  }
  return out;
}

pushRouter.post("/v1/frames/:mac/push", requirePairingToken, (req: Request, res: Response) => {
  const mac = toMac(String(req.params.mac ?? ""));
  if (mac.length !== 12) {
    res.status(400).json({ ok: false, error: "invalid_mac" });
    return;
  }
  const type = req.body?.type === "playlist" ? "playlist" : "single";
  let imgs: Array<{ imgid: string; imgurl: string }> = [];
  const rawImgs = req.body?.imgs;
  if (Array.isArray(rawImgs) && rawImgs.length) {
    imgs = rawImgs
      .map((i: Record<string, unknown>) => ({
        imgid: String(i?.imgid ?? "").trim(),
        imgurl: resolveImgUrl(String(i?.imgurl ?? "").trim()),
      }))
      .filter((i: { imgid: string; imgurl: string }) => i.imgid && i.imgurl);
  } else {
    imgs = resolvePhotoIds(req.body?.photoIds ?? req.body?.photo_ids);
  }
  if (imgs.length === 0) {
    res.status(400).json({ ok: false, error: "no_imgs" });
    return;
  }

  // Sleep-mode guard: reject pushes to a frame that has powered down its radio
  // for power saving. Sending now would only time out / get dropped, so return
  // a clear conflict the client can surface as "Frame Asleep".
  if (isDeviceSleeping(mac)) {
    res.status(409).json({
      ok: false,
      success: false,
      code: "FRAME_ASLEEP",
      message: "Frame is currently in sleep mode. Push commands are blocked.",
    });
    return;
  }

  const job = enqueuePush(mac, type, imgs);
  res.json({ ok: true, success: true, msgid: job.msgid, status: job.status, progress: job.progress });
});

// Status polling is intentionally non-blocking-auth: msgid is a per-push
// capability and a transient 401 must never trigger a client session logout.
pushRouter.get("/v1/frames/:mac/push-status", (req: Request, res: Response) => {
  const mac = toMac(String(req.params.mac ?? ""));
  const msgid = String(req.query.msgid ?? req.query.msgId ?? "").trim();
  if (mac.length !== 12 || !msgid) {
    res.status(400).json({ ok: false, error: "missing_params" });
    return;
  }
  const job = pushStatus(mac, msgid);
  if (!job) {
    res.status(404).json({ ok: false, error: "job_not_found" });
    return;
  }
  res.json({
    ok: true,
    msgid: job.msgid,
    status: job.status,
    progress: job.progress,
    type: job.type,
    imgs: job.imgs,
    error: job.error ?? undefined,
    updatedAt: job.updatedAtMs,
  });
});

/** Also expose a single-job lookup helper for other routes. */
export function getJobOrNull(macRaw: string, msgid: string) {
  return getPushJob(macRaw, msgid);
}
