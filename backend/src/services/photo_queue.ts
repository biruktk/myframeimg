import { db } from "../db/store";
import { isMqttConnected, publishPlayImage, resolveMqttHardwareMac, setPlayAckHandler } from "./frame_mqtt";

const QUEUE_INTERVAL_MS = 60000;
let queueTimer: ReturnType<typeof setInterval> | null = null;
let publicBaseUrl = "";

export function initQueue(baseUrl: string): void {
  publicBaseUrl = baseUrl.replace(/\/$/, "");
  setPlayAckHandler(playAckReceived);
  if (queueTimer) return;
  queueTimer = setInterval(processQueue, 30000);
  processQueue();
}

export function enqueueUpload(deviceId: string, uploadId: string): void {
  db.mutate((draft) => {
    draft.frames = draft.frames.map((f) => {
      if (f.id !== deviceId) return f;
      const q = f.pendingQueue || [];
      if (!q.includes(uploadId)) q.push(uploadId);
      return { ...f, pendingQueue: q };
    });
  });
}

export function isDeliverySlotFree(deviceId: string): boolean {
  const data = db.read();
  const frame = data.frames.find((f) => f.id === deviceId);
  if (!frame) return true;
  if ((frame.pendingQueue?.length ?? 0) > 0) return false;
  if (frame.nextDeliveryAtMs && Date.now() < frame.nextDeliveryAtMs) return false;
  return true;
}

export function scheduleNextDelivery(deviceId: string): void {
  db.mutate((draft) => {
    draft.frames = draft.frames.map((f) => {
      if (f.id !== deviceId) return f;
      return { ...f, nextDeliveryAtMs: Date.now() + QUEUE_INTERVAL_MS };
    });
  });
}

export function playAckReceived(macRaw: string): void {
  const mac = resolveMqttHardwareMac(macRaw);
  if (!mac) return;
  const data = db.read();
  const frame = data.frames.find((f) => resolveMqttHardwareMac(f.id) === mac);
  if (!frame) return;
  const q = frame.pendingQueue || [];
  if (q.length === 0) {
    db.mutate((draft) => {
      draft.frames = draft.frames.map((f) => {
        if (f.id !== frame.id) return f;
        return { ...f, nextDeliveryAtMs: null };
      });
    });
    return;
  }
  const nextId = q[0];
  const upload = data.uploads.find((u) => u.id === nextId);
  if (!upload) {
    db.mutate((draft) => {
      draft.frames = draft.frames.map((f) => {
        if (f.id !== frame.id) return f;
        return { ...f, pendingQueue: q.slice(1) };
      });
    });
    return;
  }
  const imageUrl = `${publicBaseUrl}/frame-media/${encodeURIComponent(upload.filename)}`;
  if (!isMqttConnected()) {
    return;
  }
  publishPlayImage(frame.id, imageUrl).then(() => {
    db.mutate((draft) => {
      draft.frames = draft.frames.map((f) => {
        if (f.id !== frame.id) return f;
        return { ...f, pendingQueue: q.slice(1), nextDeliveryAtMs: Date.now() + QUEUE_INTERVAL_MS };
      });
      const upd = draft.uploads.find((u) => u.id === nextId);
      if (upd) {
        upd.deliveredToFrame = true;
        upd.deliveryMode = "vps_mqtt";
        upd.deliveryCheckedAtMs = Date.now();
      }
    });
  }).catch(() => {});
}

function processQueue(): void {
  const data = db.read();
  const now = Date.now();
  for (const frame of data.frames) {
    const q = frame.pendingQueue || [];
    if (q.length === 0) continue;
    if (frame.nextDeliveryAtMs && now < frame.nextDeliveryAtMs) continue;
    if (!isMqttConnected()) continue;
    const nextId = q[0];
    const upload = data.uploads.find((u) => u.id === nextId);
    if (!upload) {
      db.mutate((draft) => {
        draft.frames = draft.frames.map((f) => {
          if (f.id !== frame.id) return f;
          return { ...f, pendingQueue: q.slice(1) };
        });
      });
      continue;
    }
    const imageUrl = `${publicBaseUrl}/frame-media/${encodeURIComponent(upload.filename)}`;
    publishPlayImage(frame.id, imageUrl).then(() => {
      db.mutate((draft) => {
        draft.frames = draft.frames.map((f) => {
          if (f.id !== frame.id) return f;
          return { ...f, pendingQueue: q.slice(1), nextDeliveryAtMs: Date.now() + QUEUE_INTERVAL_MS };
        });
        const upd = draft.uploads.find((u) => u.id === nextId);
        if (upd) {
          upd.deliveredToFrame = true;
          upd.deliveryMode = "vps_mqtt";
          upd.deliveryCheckedAtMs = Date.now();
        }
      });
    }).catch(() => {});
  }
}
