/**
 * Optional MQTT bridge to frames on your broker.
 * Enable with MQTT_URL (e.g. mqtt://127.0.0.1:1883). Device command topic `/inkjoyap/{MAC}` matches stock firmware.
 */

import crypto from "crypto";
import mqtt from "mqtt";

export type FrameRecord = {
  lastSeen: number;
  status: "online" | "offline";
  config: Record<string, unknown>;
};

const frames = new Map<string, FrameRecord>();
let mqttClient: mqtt.MqttClient | null = null;

export function normalizeMac(mac: string): string {
  return mac.replace(/[^a-fA-F0-9]/gi, "").toUpperCase();
}

function handleMessage(topic: string, raw: Buffer) {
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

  switch (action) {
    case "login": {
      const d = data.data as Record<string, unknown> | undefined;
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

export function listFrames(): Array<FrameRecord & { mac: string; age: number }> {
  const now = Date.now();
  const out: Array<FrameRecord & { mac: string; age: number }> = [];
  for (const [mac, rec] of frames) {
    out.push({ mac, ...rec, age: now - rec.lastSeen });
  }
  return out.sort((a, b) => a.age - b.age);
}

export function getFrame(macRaw: string): (FrameRecord & { mac: string; age: number }) | null {
  const mac = normalizeMac(macRaw);
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
    const mac = normalizeMac(macRaw);
    const msgid = Date.now().toString();
    let host = "";
    let port = 443;
    try {
      const u = new URL(imageUrl);
      host = u.hostname;
      port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
    } catch {
      host = publicHost ?? "";
    }

    const payload = {
      action: "play",
      msgid,
      stamac: mac,
      data: {
        host: host || publicHost || "localhost",
        port,
        imgs: [{ imgid: msgid, imgurl: imageUrl }],
      },
    };

    const topic = `/inkjoyap/${mac}`;
    mqttClient.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
