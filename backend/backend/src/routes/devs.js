"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.devsRouter = void 0;
const express_1 = require("express");
const store_1 = require("../db/store");
const frame_logs_1 = require("../services/frame_logs");
const frame_mqtt_1 = require("../services/frame_mqtt");
const security_1 = require("../middleware/security");
exports.devsRouter = (0, express_1.Router)();
exports.devsRouter.use(security_1.requireAdminToken);
exports.devsRouter.get("/devs/status", (_req, res) => {
    const data = store_1.db.read();
    const mqtt = (0, frame_mqtt_1.getMqttBrokerStatus)();
    const liveFrames = (0, frame_mqtt_1.listFrames)();
    const logStats = (0, frame_logs_1.getLogStats)();
    const onlineDb = data.frames.filter((f) => f.wifiStatus === "online").length;
    const mqttOnline = liveFrames.filter((f) => f.age < 120000).length;
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
            clientid: f.clientid ?? f.mac,
            lastSeen: f.lastSeen,
            age: f.age,
            status: f.age < 120000 ? "online" : "offline",
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
exports.devsRouter.post("/devs/manual-command", async (req, res) => {
    const clientid = String(req.body?.clientid ?? "").trim();
    const payloadInput = req.body?.payload;
    if (!clientid) {
        res.status(400).json({ ok: false, error: "missing_clientid" });
        return;
    }
    if (!payloadInput || typeof payloadInput !== "object" || Array.isArray(payloadInput)) {
        res.status(400).json({ ok: false, error: "invalid_payload" });
        return;
    }
    const payload = { ...payloadInput };
    const msgid = Date.now().toString();
    payload.msgid = msgid;
    if (payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)) {
        const data = { ...payload.data };
        if (Object.prototype.hasOwnProperty.call(data, "ack_msgid")) {
            data.ack_msgid = msgid;
        }
        payload.data = data;
    }
    const stamacRaw = String(payload.stamac ?? "").trim();
    if (!(0, frame_mqtt_1.resolveMqttHardwareMac)(stamacRaw)) {
        res.status(400).json({ ok: false, error: "invalid_stamac" });
        return;
    }
    try {
        const published = await (0, frame_mqtt_1.publishManualMqttCommand)(clientid, payload);
        res.json({
            ok: true,
            topic: published.topic,
            msgid,
            payload,
        });
    }
    catch (err) {
        res.status(502).json({
            ok: false,
            error: err instanceof Error ? err.message : "manual_command_publish_failed",
        });
    }
});
exports.devsRouter.get("/devs/logs", (req, res) => {
    const mac = String(req.query.mac ?? "");
    const name = String(req.query.name ?? "");
    const q = String(req.query.q ?? "");
    const source = String(req.query.source ?? "");
    const since = Number(req.query.since ?? 0) || 0;
    const limit = Number(req.query.limit ?? 500) || 500;
    res.json({
        ok: true,
        items: (0, frame_logs_1.getFrameLogs)({ mac, name, q, source, since, limit }),
        total: (0, frame_logs_1.getFrameLogs)({ mac, name, q, source, since, limit: 2000 }).length,
    });
});
exports.devsRouter.get("/devs/logs/stream", (req, res) => {
    res.setHeader("content-type", "text/event-stream; charset=utf-8");
    res.setHeader("cache-control", "no-cache, no-transform");
    res.setHeader("connection", "keep-alive");
    res.flushHeaders?.();
    const mac = String(req.query.mac ?? "");
    const name = String(req.query.name ?? "");
    const q = String(req.query.q ?? "");
    const source = String(req.query.source ?? "").trim().toLowerCase();
    const matches = (entry) => {
        const macQ = mac.replace(/[^a-fA-F0-9]/gi, "").toUpperCase();
        const nameQ = name.trim().toLowerCase();
        const textQ = q.trim().toLowerCase();
        if (source && (entry.source ?? "").toLowerCase() !== source)
            return false;
        if (macQ && !entry.mac.includes(macQ))
            return false;
        if (nameQ && !(entry.frameName ?? "").toLowerCase().includes(nameQ))
            return false;
        if (textQ) {
            const hay = [entry.mac, entry.frameName ?? "", entry.topic, entry.action ?? "", entry.payload, entry.direction]
                .join(" ")
                .toLowerCase();
            if (!hay.includes(textQ))
                return false;
        }
        return true;
    };
    const send = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    send("ready", { ok: true });
    const unsubscribe = (0, frame_logs_1.subscribeFrameLogs)((entry) => {
        if (!matches(entry))
            return;
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
