/**
 * Optional MQTT bridge to frames on your broker.
 * Enable with MQTT_URL (e.g. mqtt://127.0.0.1:1883). Device command topic `/inkjoyap/{MAC}` matches stock firmware.
 */

import crypto from "crypto";
import mqtt from "mqtt";

import { frameMediaPlayEndpoint } from "../config/frame_media";

export type FrameRecord = {
  lastSeen: number;
  status: "online" | "offline";
  lastAction?: string;
  lastResult?: number | string;
  displayed?: boolean;
  config: Record<string, unknown>;
};

const frames = new Map<string, FrameRecord>();
let mqttClient: mqtt.MqttClient | null = null;

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

function resolveFrameMediaPath(imageUrl: string): string {
  let rawPath = imageUrl.trim();
  try {
    rawPath = new URL(imageUrl).pathname;
  } catch {
    // Accept already-normalized path input.
  }
  const basename = decodeURIComponent(rawPath.split("/").pop() ?? "").trim();
  if (!basename || !basename.toLowerCase().endsWith(".bin")) {
    throw new Error("mqtt_play_imgurl_must_end_with_dot_bin_xt_epaper_firmware_does_not_render_jpeg");
  }
  return `/frame-media/${encodeURIComponent(basename)}`;
}

function publishFrameCommand(
  stamac: string,
  payload: Record<string, unknown>,
  qos: 0 | 1,
  label: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!mqttClient?.connected) {
      reject(new Error("MQTT not connected"));
      return;
    }
    const topic = `/inkjoyap/${stamac}`;
    const body = JSON.stringify(payload);
    mqttDebugTx(topic, body);
    mqttClient.publish(topic, body, { qos }, (err) => {
      if (err) reject(err);
      else {
        console.log(`[MQTT] ${label} sent to`, stamac);
        resolve();
      }
    });
  });
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

  const mac = normalizeMac(clientid);
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
  const stamac =
    resolveMqttHardwareMac(
      typeof data.stamac === "string" && data.stamac.trim() ? data.stamac : clientid,
    ) ?? mac;

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

  switch (action) {
    case "login": {
      rec.config = {
        firmwareVersion: d?.ver,
        stationType: d?.statype,
        stamac,
      };
      void publishFrameCommand(
        stamac,
        {
          action: "login_ack",
          msgid: String(data.msgid ?? Date.now()),
          stamac,
        },
        1,
        "login_ack",
      ).catch((err) => {
        console.error("[MQTT] login_ack publish failed:", err);
      });
      break;
    }
    case "heart": {
      if (d?.ack === 1 || d?.ack === "1") {
        void publishFrameCommand(
          stamac,
          {
            action: "heart_ack",
            msgid: String(Date.now()),
            stamac,
          },
          0,
          "heart_ack",
        ).catch((err) => {
          console.error("[MQTT] heart_ack publish failed:", err);
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

export function publishLoginAck(macRaw: string, msgidRaw?: string): Promise<void> {
  const mac = resolveMqttHardwareMac(macRaw);
  if (!mac) {
    return Promise.reject(new Error("invalid_device_id_for_login_ack"));
  }
  return publishFrameCommand(
    mac,
    {
      action: "login_ack",
      msgid: msgidRaw != null && msgidRaw.trim().length > 0 ? msgidRaw.trim() : Date.now().toString(),
      stamac: mac,
    },
    1,
    "login_ack",
  );
}

/** Publish play image command (same shape as reference Node server). */
export function publishPlayImage(macRaw: string, imageUrl: string, publicHost?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    void publicHost;
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
    try {
      const { host, port } = frameMediaPlayEndpoint();
      const imgurlForPlay = resolveFrameMediaPath(imageUrl);
      const payload = {
        action: "play",
        msgid,
        stamac: mac,
        data: {
          host,
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
    } catch (err) {
      reject(err instanceof Error ? err : new Error("mqtt_play_invalid_media_base_or_path"));
      return;
    }
  });
}
