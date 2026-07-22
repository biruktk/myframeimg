/**
 * Optional MQTT bridge to frames on your broker.
 * Enable with MQTT_URL (e.g. mqtt://127.0.0.1:1883). Device command topic `/inkjoyap/{MAC}` matches stock firmware.
 */

import crypto from "crypto";
import mqtt from "mqtt";

export type FrameRecord = {
  lastSeen: number;
  status: "online" | "offline";
  lastAction?: string;
  lastResult?: number | string;
  lastUploadMs?: number;
  displayed?: boolean;
  config: Record<string, unknown>;
};

const DEFAULT_MQTT_BROKER_HOST = "47.76.164.162";
const DEFAULT_MQTT_BROKER_PORT = 1883;
const DEFAULT_MQTT_USER = "device";
const DEFAULT_MQTT_PASS = "framepass2026";

const frames = new Map<string, FrameRecord>();
let mqttClient: mqtt.MqttClient | null = null;

let onPlayAckCb: ((mac: string) => void) | null = null;

export function setPlayAckHandler(cb: (mac: string) => void): void {
  onPlayAckCb = cb;
}

export function normalizeMac(mac: string): string {
  return mac.replace(/[^a-fA-F0-9]/gi, "").toUpperCase();
}

/** 12‑hex Wi‑Fi MAC for `/inkjoyap/{MAC}` and `play` payloads; strips BLE names like `IJ_D0CF13F0161C`. */
export function resolveMqttHardwareMac(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  const low = s.toLowerCase();
  if (low.startsWith("ij_") || low.startsWith("ij-")) s = s.slice(3).trim();

  let h = normalizeMac(s);
  if (!h) return null;
  // If app sent `IJ_` as prefix merged into hex, keep only the trailing EUI‑48 (12 hex).
  if (h.length > 12) h = h.slice(-12);
  if (h.length !== 12 || !/^[0-9A-F]{12}$/i.test(h)) return null;
  return h.toUpperCase();
}

function mqttDebugRx(topic: string, raw: Buffer) {
  if (String(process.env.FRAME_MQTT_DEBUG ?? "").trim() !== "1") return;
  const txt = raw.toString("utf8");
  console.log("[frame-mqtt] <-- rx", topic, txt.length > 1500 ? `${txt.slice(0, 1500)}…` : txt);
}

function mqttDebugTx(topic: string, payloadJson: string) {
  if (String(process.env.FRAME_MQTT_DEBUG ?? "").trim() !== "1") return;
  console.log(
    "[frame-mqtt] --> tx",
    topic,
    payloadJson.length > 1500 ? `${payloadJson.slice(0, 1500)}…` : payloadJson,
  );
}

function handleMessage(topic: string, raw: Buffer) {
  mqttDebugRx(topic, raw);
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw.toString()) as Record<string, unknown>;
  } catch {
    return;
  }

  const tail = topic.split("/").pop() ?? "";
  const clientid =
    (typeof data.clientid === "string" && data.clientid) ||
    (typeof data.stamac === "string" && data.stamac) ||
    tail;

  const mac =
    resolveMqttHardwareMac(clientid) ??
    resolveMqttHardwareMac(tail) ??
    (normalizeMac(clientid).length === 12 ? normalizeMac(clientid) : null);
  if (!mac) return;

  const action = String(data.action ?? "");
  const rec: FrameRecord =
    frames.get(mac) ??
    ({
      lastSeen: Date.now(),
      status: "online",
      config: {},
    } as FrameRecord);
  rec.lastSeen = Date.now();
  rec.status = "online";
  rec.lastAction = action || rec.lastAction;

  const d = data.data as Record<string, unknown> | undefined;
  const result =
    data.result ??
    data.code ??
    data.lastResult ??
    data.displayCode ??
    d?.result ??
    d?.code ??
    d?.displayCode;
  if (typeof result === "number" || typeof result === "string") {
    rec.lastResult = result;
    const n = Number(result);
    if (n === 113) rec.displayed = true;
    if (n === 104) rec.displayed = false;
  }

  if (action === "play_ack" || action === "play") {
    const uploadMs = Number(data.msgid ?? data.upload_ms ?? data.last_upload_ms);
    if (Number.isFinite(uploadMs) && uploadMs > 0) {
      rec.lastUploadMs = uploadMs;
    } else {
      rec.lastUploadMs = rec.lastSeen;
    }
    if (action === "play_ack" && rec.displayed === true) {
      if (onPlayAckCb) onPlayAckCb(mac);
    }
  }

  switch (action) {
    case "login": {
      rec.config = {
        firmwareVersion: d?.ver,
        stationType: d?.statype,
        stamac: data.stamac,
      };
      break;
    }
    default:
      break;
  }

  frames.set(mac, rec);
}

/** Call after Express is listening. No-op if MQTT_URL unset. */
export function startFrameMqtt(): void {
  const url = process.env.MQTT_URL?.trim();
  if (!url) {
    console.log("[frame-mqtt] MQTT_URL not set — frame cloud MQTT disabled");
    return;
  }

  const user = process.env.MQTT_USER;
  const pass = process.env.MQTT_PASSWORD;

  mqttClient = mqtt.connect(url, {
    username: user || undefined,
    password: pass || undefined,
    clientId: `myframe_api_${crypto.randomBytes(6).toString("hex")}`,
    reconnectPeriod: 2000,
    connectTimeout: 10_000,
  });

  mqttClient.on("connect", () => {
    console.log("[frame-mqtt] connected");
    mqttClient?.subscribe("/device/report/+", { qos: 1 }, (err) => {
      if (err) console.error("[frame-mqtt] subscribe error", err);
    });
  });

  mqttClient.on("message", (topic, msg) => handleMessage(topic, msg));

  mqttClient.on("error", (err) => console.error("[frame-mqtt]", err));
  mqttClient.on("close", () => console.log("[frame-mqtt] connection closed"));
}

export function isMqttConnected(): boolean {
  return mqttClient?.connected ?? false;
}

/** True when the frame published login/heart/play on MQTT recently (not the API broker flag). */
export function isFrameMqttOnline(macRaw: string, maxAgeMs = 120_000): boolean {
  const rec = getFrame(macRaw);
  if (!rec) return false;
  return Date.now() - rec.lastSeen <= maxAgeMs;
}

function mqttBrokerDefaults() {
  const host = String(process.env.FRAME_MQTT_BROKER_HOST ?? DEFAULT_MQTT_BROKER_HOST).trim();
  const port = Number(process.env.FRAME_MQTT_BROKER_PORT ?? DEFAULT_MQTT_BROKER_PORT) || DEFAULT_MQTT_BROKER_PORT;
  const usr = String(process.env.FRAME_MQTT_DEVICE_USER ?? DEFAULT_MQTT_USER).trim();
  const pwd = String(process.env.FRAME_MQTT_DEVICE_PASS ?? DEFAULT_MQTT_PASS).trim();
  return { host, port, usr, pwd };
}

function publishJson(topic: string, payload: Record<string, unknown>, retain = false): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!mqttClient?.connected) {
      reject(new Error("MQTT not connected"));
      return;
    }
    const body = JSON.stringify(payload);
    mqttDebugTx(topic, body);
    mqttClient.publish(topic, body, { qos: 1, retain }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/** Retained mqtt_config on `/inkjoyap/{MAC}` — frame applies broker settings after Wi‑Fi. */
export function publishRetainedMqttConfig(macRaw: string, msgid?: string): Promise<void> {
  const mac = resolveMqttHardwareMac(macRaw);
  if (!mac) return Promise.reject(new Error("invalid_mac"));
  const broker = mqttBrokerDefaults();
  return publishJson(
    `/inkjoyap/${mac}`,
    {
      msgid: msgid ?? Date.now().toString(),
      action: "mqtt_config",
      stamac: mac,
      data: {
        host: broker.host,
        port: broker.port,
        usr: broker.usr,
        pwd: broker.pwd,
      },
    },
    true,
  );
}

/** Wake/login command so the frame reconnects to Mosquitto after provisioning. */
export function publishLoginAck(macRaw: string, msgid?: string): Promise<void> {
  const mac = resolveMqttHardwareMac(macRaw);
  if (!mac) return Promise.reject(new Error("invalid_mac"));
  return publishJson(`/inkjoyap/${mac}`, {
    msgid: msgid ?? Date.now().toString(),
    action: "login_ack",
    stamac: mac,
    data: { ack: 1 },
  });
}

export function listFrames(): Array<FrameRecord & { mac: string; age: number }> {
  const now = Date.now();
  const out: Array<FrameRecord & { mac: string; age: number }> = [];
  for (const [mac, rec] of frames) {
    out.push({ mac, ...rec, age: now - rec.lastSeen });
  }
  return out.sort((a, b) => a.age - b.age);
}

export function getFrame(macRaw: string): (FrameRecord & { mac: string; age: number }) | null {
  const mac = resolveMqttHardwareMac(macRaw);
  if (!mac) return null;
  const rec = frames.get(mac);
  if (!rec) return null;
  return { mac, ...rec, age: Date.now() - rec.lastSeen };
}

/** Publish play image command (same shape as reference Node server). */
export function publishPlayImage(macRaw: string, imageUrl: string, publicHost?: string): Promise<void> {
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

      if (
        u.protocol === "https:" &&
        String(process.env.FRAME_PLAY_ALLOW_HTTPS ?? "").trim() !== "1"
      ) {
        reject(new Error("mqtt_play_https_blocked_set_FRAME_PLAY_ALLOW_HTTPS_1_or_use_http_PUBLIC_BASE_URL"));
        return;
      }

      /**
       * ESP32 fetches MYFM `.bin` from the same host/port as `image_url` (nginx :80).
       * Do NOT override with PUBLIC_MEDIA_BASE_URL when that env points at the Node API (:3001).
       */
      host = u.hostname;
      port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
    } catch {
      const mediaBaseRaw = process.env.PUBLIC_MEDIA_BASE_URL?.trim();
      if (mediaBaseRaw) {
        try {
          const mu = new URL(mediaBaseRaw);
          host = mu.hostname;
          port = mu.port ? Number(mu.port) : mu.protocol === "https:" ? 443 : 80;
        } catch {
          host = publicHost ?? "";
        }
      } else {
        host = publicHost ?? "";
      }
    }

    const pathProbe = decodeURIComponent(imgurlForPlay.split("?", 2)[0]!.toLowerCase());
    if (!pathProbe.endsWith(".bin")) {
      reject(
        new Error(
          "mqtt_play_imgurl_must_end_with_dot_bin_xt_epaper_firmware_does_not_render_jpeg",
        ),
      );
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

    const topic = `/inkjoyap/${mac}`;
    const body = JSON.stringify(payload);
    mqttDebugTx(topic, body);
    mqttClient.publish(topic, body, { qos: 1 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
