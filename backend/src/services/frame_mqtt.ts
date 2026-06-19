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

function frameAckEnabled(): boolean {
  return String(process.env.FRAME_MQTT_ACKS ?? "0").trim() === "1";
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
  if (low.startsWith("xt_esp_")) s = s.slice(7).trim();
  else if (low.startsWith("xt-esp-")) s = s.slice(7).trim();

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

/** ESP32 BLE MAC is typically Wi‑Fi station MAC + 2 (last octet). */
function esp32BleMacFromWifiMac(wifiMac: string): string | null {
  const value = Number.parseInt(wifiMac, 16);
  if (!Number.isFinite(value)) return null;
  return (value + 2).toString(16).toUpperCase().padStart(12, "0").slice(-12);
}

function mqttBrokerPayload(msgid?: string): Record<string, unknown> {
  const host =
    process.env.MQTT_BROKER_PUBLIC_HOST?.trim() ||
    process.env.PUBLIC_BASE_URL?.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim() ||
    "128.241.231.234";
  const port = Number(process.env.MQTT_BROKER_PUBLIC_PORT || 1883);
  return {
    msgid: msgid || Date.now().toString(),
    action: "mqtt_config",
    data: {
      host,
      port,
      usr: process.env.MQTT_USER || "device",
      pwd: process.env.MQTT_PASSWORD || process.env.MQTT_BROKER_DEVICE_PASS || "framepass2026",
    },
  };
}

function publishFrameCommand(
  stamac: string,
  payload: Record<string, unknown>,
  qos: 0 | 1,
  label: string,
  retain = false,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!mqttClient?.connected) {
      reject(new Error("MQTT not connected"));
      return;
    }
    const topic = `/inkjoyap/${stamac}`;
    const body = JSON.stringify(payload);
    mqttDebugTx(topic, body);
    mqttClient.publish(topic, body, { qos, retain }, (err) => {
      if (err) reject(err);
      else {
        console.log(`[MQTT] ${label} sent to`, stamac, retain ? "(retain)" : "");
        resolve();
      }
    });
  });
}

async function publishToStationAndBleMac(
  wifiMac: string,
  payload: Record<string, unknown>,
  qos: 0 | 1,
  label: string,
  retain = false,
): Promise<void> {
  await publishFrameCommand(wifiMac, payload, qos, label, retain);
  const bleMac = esp32BleMacFromWifiMac(wifiMac);
  if (bleMac && bleMac !== wifiMac) {
    await publishFrameCommand(bleMac, payload, qos, `${label}_ble`, retain);
  }
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

  const mac = resolveMqttHardwareMac(clientid) ?? normalizeMac(clientid);
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
  if (action === "shutdown") {
    rec.status = "offline";
    rec.displayed = false;
  }
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
    if (n === 113 || n === 184) rec.displayed = true;
    if (n === 104) rec.displayed = false;
  }
  if (action === "play_ack") {
    rec.status = "online";
    rec.displayed = true;
  }

  switch (action) {
    case "login": {
      rec.config = {
        firmwareVersion: d?.ver,
        stationType: d?.statype,
        stamac,
      };
      if (frameAckEnabled()) {
        const msgid = String(data.msgid ?? Date.now());
        void (async () => {
          try {
            await publishToStationAndBleMac(stamac, mqttBrokerPayload(msgid), 1, "mqtt_config_wakeup", true);
            await publishToStationAndBleMac(
              stamac,
              { action: "login_ack", msgid, stamac },
              1,
              "login_ack",
              true,
            );
          } catch (err) {
            console.error("[MQTT] login wakeup publish failed:", err);
          }
        })();
      }
      break;
    }
    case "heart": {
      if (frameAckEnabled() && (d?.ack === 1 || d?.ack === "1")) {
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


export function mqttConnectedForStatus(macRaw: string): boolean {
  if (isFrameMqttOnline(macRaw)) return true;
  const mac = resolveKnownMqttHardwareMac(macRaw);
  if (!mac) return false;
  const rec = frames.get(mac);
  if (!rec || rec.status !== "online") return false;
  const grace = Number(process.env.FRAME_MQTT_GRACE_MS ?? 300000) || 300000;
  if (Date.now() - rec.lastSeen > grace) return false;
  const action = String(rec.lastAction ?? "").toLowerCase();
  return action === "login" || action === "heart" || action === "play_ack";
}

export function isFrameMqttOnline(macRaw: string, maxAgeMs = 300_000): boolean {
  const mac = resolveKnownMqttHardwareMac(macRaw);
  if (!mac) return false;
  const rec = frames.get(mac);
  if (!rec || rec.status !== "online") return false;
  const age = Date.now() - rec.lastSeen;
  if (age > maxAgeMs) return false;
  const action = String(rec.lastAction ?? "");
  return action === "login" || action === "heart" || action === "play_ack";
}

export function getMqttBrokerStatus(): {
  connected: boolean;
  connectedSinceMs: number | null;
  brokerUrl: string | null;
} {
  return {
    connected: isMqttConnected(),
    connectedSinceMs: null,
    brokerUrl: process.env.MQTT_URL?.trim() || null,
  };
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

export function resolveKnownMqttHardwareMac(raw: string): string | null {
  const exact = resolveMqttHardwareMac(raw);
  if (exact) return exact;

  const suffix = normalizeMac(raw).slice(-4);
  if (suffix.length < 4) return null;

  const matches = Array.from(frames.keys()).filter((mac) => mac.endsWith(suffix));
  return matches.length === 1 ? matches[0] : null;
}

export function getFrame(macRaw: string): (FrameRecord & { mac: string; age: number }) | null {
  const exact = resolveMqttHardwareMac(macRaw);
  const candidates = new Set<string>();
  if (exact) candidates.add(exact);

  const suffix = normalizeMac(macRaw).slice(-4);
  if (suffix.length >= 4) {
    for (const knownMac of frames.keys()) {
      if (knownMac.endsWith(suffix)) candidates.add(knownMac);
    }
  }

  for (const mac of candidates) {
    const rec = frames.get(mac);
    if (rec) return { mac, ...rec, age: Date.now() - rec.lastSeen };
  }
  return null;
}

/** Push broker credentials over MQTT (retained) so frames reconnect after Wi‑Fi/BLE setup. */
export function publishMqttBrokerConfig(macRaw: string, msgidRaw?: string): Promise<void> {
  const mac = resolveKnownMqttHardwareMac(macRaw);
  if (!mac) {
    return Promise.reject(new Error("invalid_device_id_for_mqtt_config"));
  }
  const msgid = msgidRaw != null && msgidRaw.trim().length > 0 ? msgidRaw.trim() : Date.now().toString();
  return publishToStationAndBleMac(mac, mqttBrokerPayload(msgid), 1, "mqtt_config", true);
}

export async function publishLoginAck(macRaw: string, msgidRaw?: string): Promise<void> {
  const mac = resolveKnownMqttHardwareMac(macRaw);
  if (!mac) {
    throw new Error("invalid_device_id_for_login_ack");
  }
  const msgid = msgidRaw != null && msgidRaw.trim().length > 0 ? msgidRaw.trim() : Date.now().toString();
  await publishMqttBrokerConfig(mac, msgid);
  await publishToStationAndBleMac(
    mac,
    { action: "login_ack", msgid, stamac: mac },
    1,
    "login_ack",
    true,
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
    const mac = resolveKnownMqttHardwareMac(macRaw);
    if (!mac) {
      reject(new Error("invalid_device_id_for_mqtt_play"));
      return;
    }
    const rec = frames.get(mac);
    if (rec) {
      rec.lastAction = "play";
      rec.lastResult = undefined;
      rec.displayed = false;
      frames.set(mac, rec);
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

      const body = JSON.stringify(payload);
      const publishOne = (targetMac: string, label: string) =>
        new Promise<void>((res, rej) => {
          const topic = `/inkjoyap/${targetMac}`;
          mqttDebugTx(topic, body);
          mqttClient!.publish(topic, body, { qos: 1, retain: true }, (err) => {
            if (err) rej(err);
            else {
              console.log(`[MQTT] ${label} sent to`, targetMac, "(retain)");
              res();
            }
          });
        });

      const targets = [mac];
      const bleMac = esp32BleMacFromWifiMac(mac);
      if (bleMac && bleMac !== mac) targets.push(bleMac);

      void (async () => {
        try {
          for (const target of targets) {
            await publishOne(target, target === mac ? "play" : "play_ble");
          }
          const after: FrameRecord =
            frames.get(mac) ??
            ({
              lastSeen: Date.now(),
              status: "online",
              config: {},
            } as FrameRecord);
          after.lastAction = "play";
          after.displayed = false;
          // Do not refresh lastSeen/status for outbound play; only frame reports prove MQTT liveness.
          frames.set(mac, after);
          resolve();
        } catch (err) {
          reject(err);
        }
      })();
    } catch (err) {
      reject(err instanceof Error ? err : new Error("mqtt_play_invalid_media_base_or_path"));
      return;
    }
  });
}
