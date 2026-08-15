import express from "express";
import { db } from "../db/store";
import { verifyUserJwtBearer } from "../services/app_user_jwt";

export const notificationsRouter = express.Router();

notificationsRouter.use(express.json({ limit: "256kb" }));

/** GET /api/v1/user/notifications & GET /api/notifications */
function handleGetNotifications(req: express.Request, res: express.Response) {
  const auth = verifyUserJwtBearer(req);
  if (!auth?.userId) {
    res.json({ ok: true, notifications: [] });
    return;
  }

  const data = db.read();
  const rawList = data.notifications || [];
  const userNotifications = rawList
    .filter((n) => n.userId === auth.userId || n.userId === "all")
    .map((n) => {
      const timeMs = n.createdAtMs ?? n.atMs ?? Date.now();
      return {
        id: n.id,
        userId: n.userId,
        type: n.type,
        title: n.title ?? "Notification",
        body: n.body ?? "",
        createdAtMs: timeMs,
        read: n.read ?? false,
      };
    })
    .sort((a, b) => b.createdAtMs - a.createdAtMs);

  res.json({
    ok: true,
    notifications: userNotifications,
    data: {
      notifications: userNotifications,
    },
  });
}

notificationsRouter.get("/v1/user/notifications", handleGetNotifications);
notificationsRouter.get("/notifications", handleGetNotifications);

notificationsRouter.post("/v1/user/notifications/read", (req, res) => {
  const auth = verifyUserJwtBearer(req);
  if (!auth?.userId) {
    res.json({ ok: true });
    return;
  }

  db.mutate((draft) => {
    if (!draft.notifications) return;
    draft.notifications = draft.notifications.map((n) => {
      if (n.userId === auth.userId || n.userId === "all") {
        return { ...n, read: true };
      }
      return n;
    });
  });

  res.json({ ok: true });
});
