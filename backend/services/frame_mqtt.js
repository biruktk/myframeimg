"use strict";
/**
 * Optional MQTT bridge to frames on your broker.
 * Enable with MQTT_URL (e.g. mqtt://127.0.0.1:1883). Device command topic `/myframe/{MAC}` matches stock firmware.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HEARTBEAT_TIMEOUT_MS = exports.HEARTBEAT_ONLINE_MS = exports.FRAME_HEART_INTERVAL_MS = void 0;
exports.setPlayAckHandler = setPlayAckHandler;
exports.normalizeMac = normalizeMac;
exports.resolveMqttHardwareMac = resolveMqttHardwareMac;
exports.startFrameMqtt = startFrameMqtt;
exports.isMqttConnected = isMqttConnected;
exports.isFrameMqttOnline = isFrameMqttOnline;
exports.isFrameMqttFresh = isFrameMqttFresh;
exports.classifyFramePresence = classifyFramePresence;
exports.publishRetainedMqttConfig = publishRetainedMqttConfig;
exports.publishLoginAck = publishLoginAck;
exports.getStaleDbFrames = getStaleDbFrames;
exports.listFrames = listFrames;
exports.getFrame = getFrame;
exports.publishPlayImage = publishPlayImage;
exports.publishMqttAction = publishMqttAction;
exports.publishSleepConfig = publishSleepConfig;
exports.publishStopPlaylistKeepDisplay = publishStopPlaylistKeepDisplay;
exports.publishStrategyCommand = publishStrategyCommand;
const crypto_1 = __importDefault(require("crypto"));
const firmware_releases_1 = require("../data/firmware_releases");
const mqtt_1 = __importDefault(require("mqtt"));
const store_1 = require("../db/store");
/**
 * Frame firmware (0.5.x) emits MQTT `heart` about every ~10 minutes and often
 * reconnects (`login`) on the same cadence. A 2-minute offline TTL caused constant
 * false-offlines while Wi-Fi was still up (wake-on-send still worked via MQTT).
 *
 * Grace = 3 missed hearts + buffer.
 */
exports.FRAME_HEART_INTERVAL_MS = 10 * 60 * 1000; // observed ~10 min
exports.HEARTBEAT_ONLINE_MS = Math.round(exports.FRAME_HEART_INTERVAL_MS * 1.5); // 15 min — fresh
exports.HEARTBEAT_TIMEOUT_MS = exports.FRAME_HEART_INTERVAL_MS * 3; // 30 min — still reachable
const DEFAULT_MQTT_BROKER_HOST = "47.76.164.162";
const DEFAULT_MQTT_BROKER_PORT = 1883;
const DEFAULT_MQTT_USER = "device";
const DEFAULT_MQTT_PASS = "framepass2026";
const frames = new Map();
let mqttClient = null;
let onPlayAckCb = null;
function setPlayAckHandler(cb) {
    onPlayAckCb = cb;
}
function normalizeMac(mac) {
    return mac.replace(/[^a-fA-F0-9]/gi, "").toUpperCase();
}
/** Resolve any device identifier to its 12‑hex station (MQTT) MAC.
 *  - If `raw` is already a 12‑hex string, return it.
 *  - Otherwise try to look up the frame in the DB by its BLE MAC or ID
 *    and return the stored `stationMac` (the Wi‑Fi MAC used for MQTT).
 */
function resolveMqttHardwareMac(raw) {
    const m = String(raw ?? "").trim();
    if (!m)
        return null;
    if (/^[A-F0-9]{12}$/i.test(m))
        return m.toUpperCase();
    const data = store_1.db.read();
    const norm = normalizeMac(m);
    const match = data.frames.find(function (f) {
        return normalizeMac(f.bleMac) === norm || normalizeMac(f.id) === norm;
    });
    if (match?.stationMac)
        return match.stationMac;
    return m.toUpperCase();
}
function mqttDebugRx(topic, raw) {
    if (String(process.env.FRAME_MQTT_DEBUG ?? "").trim() !== "1")
        return;
    const txt = raw.toString("utf8");
    console.log("[frame-mqtt] <-- rx", topic, txt.length > 1500 ? `${txt.slice(0, 1500)}…` : txt);
}
function mqttDebugTx(topic, payloadJson) {
    if (String(process.env.FRAME_MQTT_DEBUG ?? "").trim() !== "1")
        return;
    console.log("[frame-mqtt] --> tx", topic, payloadJson.length > 1500 ? `${payloadJson.slice(0, 1500)}…` : payloadJson);
}
function handleMessage(topic, raw) {
    mqttDebugRx(topic, raw);
    let data;
    try {
        data = JSON.parse(raw.toString());
    }
    catch {
        return;
    }
    const tail = topic.split("/").pop() ?? "";
    const clientid = (typeof data.clientid === "string" && data.clientid) ||
        (typeof data.stamac === "string" && data.stamac) ||
        tail;
    const mac = resolveMqttHardwareMac(clientid) ??
        resolveMqttHardwareMac(tail) ??
        (normalizeMac(clientid).length === 12 ? normalizeMac(clientid) : null);
    if (!mac)
        return;
    const action = String(data.action ?? "");
    const rec = frames.get(mac) ??
        {
            lastSeen: Date.now(),
            status: "online",
            config: {},
        };
    rec.lastSeen = Date.now();
    rec.status = "online";
    rec.lastAction = action || rec.lastAction;
    const d = data.data;
    const result = data.result ??
        data.code ??
        data.lastResult ??
        data.displayCode ??
        d?.result ??
        d?.code ??
        d?.displayCode;
    if (typeof result === "number" || typeof result === "string") {
        rec.lastResult = result;
        const n = Number(result);
        if (n === 113)
            rec.displayed = true;
        if (n === 104)
            rec.displayed = false;
    }
    if (d && typeof d === "object") {
        var bat = Number(d.battery);
        if (Number.isFinite(bat) && bat >= 0)
            rec.battery = bat;
        var tfSize = Number(d.tfsize);
        if (Number.isFinite(tfSize) && tfSize > 0)
            rec.storageTotal = tfSize;
        var tfUsed = Number(d.tfused);
        if (Number.isFinite(tfUsed) && tfUsed >= 0)
            rec.storageUsed = tfUsed;
    }
    if (action === "play_ack" || action === "play") {
        const uploadMs = Number(data.msgid ?? data.upload_ms ?? data.last_upload_ms);
        if (Number.isFinite(uploadMs) && uploadMs > 0) {
            rec.lastUploadMs = uploadMs;
        }
        else {
            rec.lastUploadMs = rec.lastSeen;
        }
        if (action === "play_ack" && rec.displayed === true) {
            if (onPlayAckCb)
                onPlayAckCb(mac);
        }
    }
    store_1.db.mutate((draft) => {
        const prefix10 = mac.slice(0, 10);
        let match = draft.frames.find((f) => normalizeMac(f.bleMac).startsWith(prefix10) || normalizeMac(f.stationMac ?? "") === mac);
        if (!match) {
            match = {
                id: mac.toLowerCase(),
                bleMac: mac,
                ownerUserId: "",
                sharedToUserIds: [],
                wifiSsid: null,
                wifiStatus: "online",
                firmwareVersion: "0.0.0",
                lastSeenAtMs: Date.now(),
                uptimeMs: 0,
                pendingQueue: [],
                nextDeliveryAtMs: null,
                ota: { targetVersion: null, status: "idle" },
            };
            draft.frames.push(match);
        }
        match.wifiStatus = "online";
        match.lastSeenAtMs = Date.now();
        if (!match.stationMac)
            match.stationMac = mac;
        if (d && typeof d === "object") {
            const bat = Number(d.battery);
            if (Number.isFinite(bat) && bat >= 0)
                match.battery = bat;
            const fv = (0, firmware_releases_1.normalizeFirmwareVersion)(String(d.version ?? d.ver ?? ""));
            if (fv && fv !== "0.0.0")
                match.firmwareVersion = fv;
            if (d.wifi_name && typeof d.wifi_name === "string")
                match.wifiSsid = d.wifi_name;
        }
    });
    switch (action) {
        case "login": {
            rec.config = {
                firmwareVersion: d?.ver,
                stationType: d?.statype,
                stamac: data.stamac,
            };
            if (mac.length === 12) {
                store_1.db.mutate(function (draft) {
                    var prefix = mac.slice(0, 10);
                    var match = draft.frames.find(function (f) { return normalizeMac(f.bleMac).startsWith(prefix) && !f.stationMac; });
                    if (match)
                        match.stationMac = mac;
                });
            }
            break;
        }
        default:
            break;
    }
    frames.set(mac, rec);
}
/** Call after Express is listening. No-op if MQTT_URL unset. */
function startFrameMqtt() {
    const url = process.env.MQTT_URL?.trim();
    if (!url) {
        console.log("[frame-mqtt] MQTT_URL not set — frame cloud MQTT disabled");
        return;
    }
    const user = process.env.MQTT_USER;
    const pass = process.env.MQTT_PASSWORD;
    mqttClient = mqtt_1.default.connect(url, {
        username: user || undefined,
        password: pass || undefined,
        clientId: `myframe_api_${crypto_1.default.randomBytes(6).toString("hex")}`,
        reconnectPeriod: 2000,
        connectTimeout: 10000,
    });
    mqttClient.on("connect", () => {
        console.log("[frame-mqtt] connected");
        mqttClient?.subscribe("/device/report/+", { qos: 1 }, (err) => {
            if (err)
                console.error("[frame-mqtt] subscribe error", err);
        });
    });
    mqttClient.on("message", (topic, msg) => handleMessage(topic, msg));
    mqttClient.on("error", (err) => console.error("[frame-mqtt]", err));
    mqttClient.on("close", () => console.log("[frame-mqtt] connection closed"));
    // Mark DB offline only after full grace (3 missed hearts), not after a single gap.
    setInterval(() => {
        const now = Date.now();
        store_1.db.mutate((draft) => {
            for (const f of draft.frames) {
                if (f.wifiStatus === "never_provisioned")
                    continue;
                const age = f.lastSeenAtMs != null ? now - f.lastSeenAtMs : null;
                const isLive = age != null && age < exports.HEARTBEAT_TIMEOUT_MS;
                if (!isLive && f.wifiStatus !== "offline") {
                    f.wifiStatus = "offline";
                    console.log(`[frame-mqtt] Frame ${f.id} marked offline (last seen ${age != null ? Math.round(age / 1000) + "s ago" : "never"}; grace=${exports.HEARTBEAT_TIMEOUT_MS / 1000}s)`);
                }
                else if (isLive && f.wifiStatus === "offline") {
                    f.wifiStatus = "online";
                }
            }
        });
    }, 60000).unref();
}
function isMqttConnected() {
    return mqttClient?.connected ?? false;
}
/** True when the frame has been heard within the reachable grace window. */
function isFrameMqttOnline(macRaw) {
    const rec = getFrame(macRaw);
    return rec != null && rec.age < exports.HEARTBEAT_TIMEOUT_MS;
}
/** Fresh heart (within ONLINE window). */
function isFrameMqttFresh(macRaw) {
    const rec = getFrame(macRaw);
    return rec != null && rec.age < exports.HEARTBEAT_ONLINE_MS;
}
/** Classify presence from last-seen age + optional scheduled sleep. */
function classifyFramePresence(ageMs, sleeping = false) {
    if (sleeping)
        return "sleeping";
    if (ageMs == null || !Number.isFinite(ageMs) || ageMs < 0)
        return "offline";
    if (ageMs < exports.HEARTBEAT_ONLINE_MS)
        return "online";
    if (ageMs < exports.HEARTBEAT_TIMEOUT_MS)
        return "idle";
    return "offline";
}
function mqttBrokerDefaults() {
    const host = String(process.env.FRAME_MQTT_BROKER_HOST ?? DEFAULT_MQTT_BROKER_HOST).trim();
    const port = Number(process.env.FRAME_MQTT_BROKER_PORT ?? DEFAULT_MQTT_BROKER_PORT) || DEFAULT_MQTT_BROKER_PORT;
    const usr = String(process.env.FRAME_MQTT_DEVICE_USER ?? DEFAULT_MQTT_USER).trim();
    const pwd = String(process.env.FRAME_MQTT_DEVICE_PASS ?? DEFAULT_MQTT_PASS).trim();
    return { host, port, usr, pwd };
}
function publishJson(topic, payload, retain = false) {
    return new Promise((resolve, reject) => {
        if (!mqttClient?.connected) {
            reject(new Error("MQTT not connected"));
            return;
        }
        const body = JSON.stringify(payload);
        mqttDebugTx(topic, body);
        mqttClient.publish(topic, body, { qos: 1, retain }, (err) => {
            if (err)
                reject(err);
            else
                resolve();
        });
    });
}
/** Retained mqtt_config on `/myframe/{MAC}` — frame applies broker settings after Wi‑Fi. */
function publishRetainedMqttConfig(macRaw, msgid) {
    const mac = resolveMqttHardwareMac(macRaw);
    if (!mac)
        return Promise.reject(new Error("invalid_mac"));
    const broker = mqttBrokerDefaults();
    return publishJson(`/myframe/${mac}`, {
        msgid: msgid ?? Date.now().toString(),
        action: "mqtt_config",
        stamac: mac,
        data: {
            host: broker.host,
            port: broker.port,
            usr: broker.usr,
            pwd: broker.pwd,
        },
    }, true);
}
/** Wake/login command so the frame reconnects to Mosquitto after provisioning. */
function publishLoginAck(macRaw, msgid) {
    const mac = resolveMqttHardwareMac(macRaw);
    if (!mac)
        return Promise.reject(new Error("invalid_mac"));
    return publishJson(`/myframe/${mac}`, {
        msgid: msgid ?? Date.now().toString(),
        action: "login_ack",
        stamac: mac,
        data: { ack: 1 },
    });
}
/** Returns frames from the DB whose lastSeenAtMs is stale (no recent heartbeat). */
function getStaleDbFrames() {
    const now = Date.now();
    return store_1.db.read().frames.filter((f) => {
        if (f.wifiStatus === "never_provisioned")
            return false;
        if (!f.lastSeenAtMs)
            return true;
        return now - f.lastSeenAtMs > exports.HEARTBEAT_TIMEOUT_MS;
    }).map((f) => ({ id: f.id, bleMac: f.bleMac, lastSeenAtMs: f.lastSeenAtMs }));
}
function listFrames() {
    const now = Date.now();
    const out = [];
    for (const [mac, rec] of frames) {
        out.push({ mac, ...rec, age: now - rec.lastSeen });
    }
    return out.sort((a, b) => a.age - b.age);
}
function getFrame(macRaw) {
    const mac = resolveMqttHardwareMac(macRaw);
    if (!mac)
        return null;
    const rec = frames.get(mac);
    if (!rec)
        return null;
    return { mac, ...rec, age: Date.now() - rec.lastSeen };
}
/** Publish play image command (same shape as reference Node server). */
function publishPlayImage(macRaw, imageUrl, publicHost) {
    return new Promise((resolve, reject) => {
        if (!mqttClient?.connected) {
            reject(new Error("MQTT not connected"));
            return;
        }
        const mac = resolveMqttHardwareMac(macRaw);
        if (!mac) {
            reject(new Error("invalid_device_id_for_mqtt_play"));
            return;
        }
        const msgid = Date.now().toString();
        let host = "";
        let port = 80;
        let imgurlForPlay = imageUrl;
        try {
            const u = new URL(imageUrl);
            // Stock firmware examples use path-only `imgurl` with `host` + `port` in `data`
            // (see files/9_API_DOCUMENTATION.md). Full absolute URLs in `imgurl` can break download.
            if (String(process.env.MQTT_PLAY_FULL_IMGURL ?? "").trim() !== "1") {
                imgurlForPlay = `${u.pathname}${u.search ?? ""}`;
            }
            if (u.protocol === "https:" &&
                String(process.env.FRAME_PLAY_ALLOW_HTTPS ?? "").trim() !== "1") {
                reject(new Error("mqtt_play_https_blocked_set_FRAME_PLAY_ALLOW_HTTPS_1_or_use_http_PUBLIC_BASE_URL"));
                return;
            }
            /**
             * ESP32 fetches MYFM `.bin` from the same host/port as `image_url` (nginx :80).
             * Do NOT override with PUBLIC_MEDIA_BASE_URL when that env points at the Node API (:3001).
             */
            host = u.hostname;
            port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
        }
        catch {
            const mediaBaseRaw = process.env.PUBLIC_MEDIA_BASE_URL?.trim();
            if (mediaBaseRaw) {
                try {
                    const mu = new URL(mediaBaseRaw);
                    host = mu.hostname;
                    port = mu.port ? Number(mu.port) : mu.protocol === "https:" ? 443 : 80;
                }
                catch {
                    host = publicHost ?? "";
                }
            }
            else {
                host = publicHost ?? "";
            }
        }
        const pathProbe = decodeURIComponent(imgurlForPlay.split("?", 2)[0].toLowerCase());
        if (!pathProbe.endsWith(".bin")) {
            reject(new Error("mqtt_play_imgurl_must_end_with_dot_bin_xt_epaper_firmware_does_not_render_jpeg"));
            return;
        }
        const payload = {
            action: "play",
            msgid,
            stamac: mac,
            data: {
                host: host || publicHost || "localhost",
                port,
                imgs: [{ imgid: msgid, imgurl: imgurlForPlay }],
            },
        };
        const topic = `/myframe/${mac}`;
        const body = JSON.stringify(payload);
        mqttDebugTx(topic, body);
        mqttClient.publish(topic, body, { qos: 1 }, (err) => {
            if (err)
                reject(err);
            else
                resolve();
        });
    });
}
/** Publish an MQTT action command (sleep/wake) to /myframe/{MAC}. */
function publishMqttAction(macRaw, action, msgid) {
    const mac = resolveMqttHardwareMac(macRaw);
    if (!mac)
        return Promise.reject(new Error("invalid_mac"));
    return publishJson(`/myframe/${mac}`, {
        msgid: msgid ?? Date.now().toString(),
        action: action,
        stamac: mac,
    });
}
/** Send sleep schedule to the frame via ntp config. */
function publishSleepConfig(macRaw, config, msgid) {
    const mac = resolveMqttHardwareMac(macRaw);
    if (!mac)
        return Promise.reject(new Error("invalid_mac"));
    // Retained so reconnecting frames keep the latest sleep/wake preference.
    return publishJson("/myframe/" + mac, {
        msgid: msgid ?? Date.now().toString(),
        action: "config",
        stamac: mac,
        data: {
            ntp: {
                enable: config.enabled ? 1 : 0,
                sleep_start: config.startTime,
                sleep_end: config.endTime,
            },
        },
    }, true);
}
/**
 * Stop firmware-side playlist rotation without forcing the connected/idle image.
 * Used before a single cast so an old local slideshow cannot overwrite the new photo later.
 */
function publishStopPlaylistKeepDisplay(macRaw) {
    return publishStrategyCommand(macRaw, {
        strategy: 1,
        intervalMinutes: 0,
        begintime: "",
        endtime: "",
        idle: 0,
    });
}
function publishStrategyCommand(macRaw, config, msgid) {
    const mac = resolveMqttHardwareMac(macRaw);
    if (!mac)
        return Promise.reject(new Error("invalid_mac"));
    const host = config.host ?? (process.env.PUBLIC_BASE_URL ? new URL(process.env.PUBLIC_BASE_URL).hostname : "");
    const port = process.env.PUBLIC_BASE_URL?.startsWith("https") ? 443 : 80;
    return publishJson("/myframe/" + mac, {
        msgid: msgid ?? Date.now().toString(),
        action: "strategy",
        stamac: mac,
        data: {
            idle: config.idle,
            strategy: config.strategy,
            host,
            port,
            path: "/frame-media/",
            updatetype: "2",
            begintime: config.begintime,
            endtime: config.endtime,
            intervalminutes: config.intervalMinutes,
            updatedays: 0,
            updatetimelist: [],
        },
    });
}
