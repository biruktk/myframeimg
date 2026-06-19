import { Router } from "express";

import { db } from "../db/store";
import { getFrameLogs, getLogStats, subscribeFrameLogs } from "../services/frame_logs";
import { getMqttBrokerStatus, listFrames } from "../services/frame_mqtt";
import { requireAdminToken } from "../middleware/security";

export const devsRouter = Router();
devsRouter.use(requireAdminToken);

devsRouter.get("/devs/status", (_req, res) => {
  const data = db.read();
  const mqtt = getMqttBrokerStatus();
  const liveFrames = listFrames();
  const logStats = getLogStats();

  const onlineDb = data.frames.filter((f) => f.wifiStatus === "online").length;
  const mqttOnline = liveFrames.filter((f) => f.age < 120_000).length;
  const connectedClients = Math.max(onlineDb, mqttOnline);

  res.json({
    ok: true,
    mqtt: {
      ...mqtt,
      liveFrameCount: liveFrames.length,
      mqttOnlineCount: mqttOnline,
    },
    messagesPerMin: logStats.messagesPerMin,
    totalLogEntries: logStats.total,
    connectedClients,
    registeredFrames: data.frames.length,
    liveFrames: liveFrames.map((f) => ({
      mac: f.mac,
      lastSeen: f.lastSeen,
      age: f.age,
      status: f.age < 120_000 ? "online" : "offline",
      lastAction: f.lastAction ?? null,
      lastResult: f.lastResult ?? null,
    })),
    frames: data.frames.map((f) => ({
      id: f.id,
      bleMac: f.bleMac,
      wifiStatus: f.wifiStatus,
      firmwareVersion: f.firmwareVersion,
      lastSeenAtMs: f.lastSeenAtMs,
      ownerUserId: f.ownerUserId,
    })),
  });
});

devsRouter.get("/devs/logs", (req, res) => {
  const mac = String(req.query.mac ?? "");
  const name = String(req.query.name ?? "");
  const q = String(req.query.q ?? "");
  const since = Number(req.query.since ?? 0) || 0;
  const limit = Number(req.query.limit ?? 500) || 500;
  res.json({
    ok: true,
    items: getFrameLogs({ mac, name, q, since, limit }),
    total: getFrameLogs({ mac, name, q, since, limit: 2000 }).length,
  });
});

devsRouter.get("/devs/logs/stream", (req, res) => {
  res.setHeader("content-type", "text/event-stream; charset=utf-8");
  res.setHeader("cache-control", "no-cache, no-transform");
  res.setHeader("connection", "keep-alive");
  res.flushHeaders?.();

  const mac = String(req.query.mac ?? "");
  const name = String(req.query.name ?? "");
  const q = String(req.query.q ?? "");

  const matches = (entry: ReturnType<typeof getFrameLogs>[number]) => {
    const macQ = mac.replace(/[^a-fA-F0-9]/gi, "").toUpperCase();
    const nameQ = name.trim().toLowerCase();
    const textQ = q.trim().toLowerCase();
    if (macQ && !entry.mac.includes(macQ)) return false;
    if (nameQ && !(entry.frameName ?? "").toLowerCase().includes(nameQ)) return false;
    if (textQ) {
      const hay = [entry.mac, entry.frameName ?? "", entry.topic, entry.action ?? "", entry.payload, entry.direction]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(textQ)) return false;
    }
    return true;
  };

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  send("ready", { ok: true });

  const unsubscribe = subscribeFrameLogs((entry) => {
    if (!matches(entry)) return;
    send("log", entry);
  });

  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});
