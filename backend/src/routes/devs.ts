import { Router } from "express";

import { db } from "../db/store";
import { requireAdminToken } from "../middleware/security";
import { getFrameLogs, getLogStats, subscribeFrameLogs } from "../services/frame_logs";
import {
  getMqttBrokerStatus,
  listFrames,
} from "../services/frame_mqtt";

export const devsRouter = Router();
devsRouter.use(requireAdminToken);

const ONLINE_AGE_MS = 120_000;

devsRouter.get("/devs/status", (_req, res) => {
  const data = db.read();
  const mqtt = getMqttBrokerStatus();
  const liveFrames = listFrames();
  const logStats = getLogStats();
  const onlineDb = data.frames.filter((f) => f.wifiStatus === "online").length;
  const mqttOnline = liveFrames.filter((f) => f.age < ONLINE_AGE_MS).length;
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
      clientid: f.mac,
      lastSeen: f.lastSeen,
      age: f.age,
      status: f.age < ONLINE_AGE_MS ? "online" : "offline",
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
  const source = String(req.query.source ?? "");
  const since = Number(req.query.since ?? 0) || 0;
  const limit = Number(req.query.limit ?? 500) || 500;
  res.json({
    ok: true,
    items: getFrameLogs({ mac, name, q, source, since, limit }),
    total: getFrameLogs({ mac, name, q, source, since, limit: 2000 }).length,
  });
});

devsRouter.get("/devs/logs/stream", (req, res) => {
  res.setHeader("content-type", "text/event-stream; charset=utf-8");
  res.setHeader("cache-control", "no-cache, no-transform");
  res.setHeader("connection", "keep-alive");
  res.flushHeaders?.();

  const mac = String(req.query.mac ?? "").replace(/[^a-fA-F0-9]/gi, "").toUpperCase();
  const name = String(req.query.name ?? "").trim().toLowerCase();
  const q = String(req.query.q ?? "").trim().toLowerCase();
  const source = String(req.query.source ?? "").trim().toLowerCase();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  send("ready", { ok: true });

  const matches = (entry: { mac: string; frameName?: string; source: string; topic?: string; action?: string; payload?: string; direction: string }) => {
    if (source && (entry.source ?? "").toLowerCase() !== source) return false;
    if (mac && !entry.mac.includes(mac)) return false;
    if (name && !(entry.frameName ?? "").toLowerCase().includes(name)) return false;
    if (q) {
      const hay = [entry.mac, entry.frameName ?? "", entry.topic ?? "", entry.action ?? "", entry.payload ?? "", entry.direction]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };

  const unsubscribe = subscribeFrameLogs((entry) => {
    if (matches(entry)) send("log", entry);
  });
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000);
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});
