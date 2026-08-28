/**
 * Routes: per-task status lookups consumed by Flutter/gallery/task_queue_service
 * and WeChat mini-program taskQueue. Returns the newest FIFO status, which the
 * frame's hardware ACK lifecycle drives on the backend.
 */

import { Router, Request, Response } from "express";
import { dispatchQueue } from "../services/dispatch_queue";

function normalizeMacKey(raw: string): string {
  try {
    return decodeURIComponent(raw).replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  } catch {
    return raw.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  }
}

export function tasksRouter(): Router {
  const router = Router();
  router.use(require('express').json({ limit: "64kb" }));

  /**
   * GET /api/v1/tasks/:taskId/status — returns the latest dispatch status for
   * this taskId. Clients poll every ~2.5s until `completed:true`.
   */
  router.get("/v1/tasks/:taskId/status", (req: Request, res: Response) => {
    const taskId = String(req.params.taskId ?? "").trim();
    if (!taskId) {
      res.status(400).json({ ok: false, error: "missing_task_id" });
      return;
    }
    const task = dispatchQueue.getTask(taskId);
    if (!task) {
      res.status(404).json({ ok: false, error: "task_not_found" });
      return;
    }
    res.json({ ok: true, task: dispatchQueue.toApiView(task) });
  });

  /**
   * GET /api/v1/frames/:mac/active-task — returns the currently in-flight
   * task for the given frame (or null when the queue is idle/empty).
   */
  router.get("/v1/frames/:mac/active-task", (req: Request, res: Response) => {
    const macKey = normalizeMacKey(String(req.params.mac ?? ""));
    if (macKey.length < 8) {
      res.status(400).json({ ok: false, error: "invalid_mac" });
      return;
    }
    const task = dispatchQueue.getActiveTask(macKey);
    if (!task) {
      res.json({ ok: true, activeTask: null });
      return;
    }
    res.json({ ok: true, activeTask: dispatchQueue.toApiView(task) });
  });

  return router;
}
