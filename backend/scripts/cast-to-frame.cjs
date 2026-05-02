#!/usr/bin/env node
/**
 * One-off MQTT play to a frame — same payload shape as services/frame_mqtt.ts publishPlayImage.
 * Loads ../.env relative to this file (matches API dotenv cwd).
 *
 * Usage:
 *   node scripts/cast-to-frame.cjs <IJ_… or MAC> [upload-basename-or-full-http(s)-url]
 *
 * Omit the file to use newest image file in UPLOAD_DIR (default uploads/).
 */
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const mqtt = require("mqtt");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

function normalizeMac(mac) {
  return String(mac).replace(/[^a-fA-F0-9]/gi, "").toUpperCase();
}

function resolveMqttHardwareMac(raw) {
  let s = String(raw || "").trim();
  if (!s) return null;
  const low = s.toLowerCase();
  if (low.startsWith("ij_") || low.startsWith("ij-")) s = s.slice(3).trim();

  let h = normalizeMac(s);
  if (!h) return null;
  if (h.length > 12) h = h.slice(-12);
  if (h.length !== 12 || !/^[0-9A-F]{12}$/i.test(h)) return null;
  return h.toUpperCase();
}

function mediaOrigin() {
  const b = (
    process.env.PUBLIC_MEDIA_BASE_URL ||
    process.env.PUBLIC_BASE_URL ||
    "http://127.0.0.1:3001"
  ).replace(/\/$/, "");
  return b;
}

function pickLatestUpload(dir) {
  const names = fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  if (!names.length) return null;
  return names
    .map((f) => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)[0].f;
}

function buildPlayPayload(mac, absoluteImageUrl, publicFallbackHost, publicFallbackPort) {
  const msgid = Date.now().toString();
  const fullImg = String(process.env.MQTT_PLAY_FULL_IMGURL || "").trim() === "1";

  let host = "";
  let port = 443;
  let imgurlForPlay = absoluteImageUrl;
  try {
    const u = new URL(absoluteImageUrl);
    host = u.hostname;
    port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
    if (!fullImg) {
      imgurlForPlay = `${u.pathname}${u.search || ""}`;
    }
  } catch {
    host = publicFallbackHost || "";
    port = publicFallbackPort || 443;
  }

  return {
    action: "play",
    msgid,
    stamac: mac,
    data: {
      host: host || publicFallbackHost || "localhost",
      port: port || publicFallbackPort || 80,
      imgs: [{ imgid: msgid, imgurl: imgurlForPlay }],
    },
  };
}

async function main() {
  const macRaw = process.argv[2];
  const fileOrUrlArg = process.argv[3];

  if (!macRaw) {
    console.error(
      "Usage: node scripts/cast-to-frame.cjs <IJ_… or 12‑hex MAC> [upload‑basename | https URL]\n",
    );
    process.exit(1);
  }

  const mac = resolveMqttHardwareMac(macRaw);
  if (!mac) {
    console.error("Invalid device MAC / ID.");
    process.exit(1);
  }

  const mqttUrl = (process.env.MQTT_URL || "").trim();
  if (!mqttUrl) {
    console.error("MQTT_URL is not set (see backend/.env).");
    process.exit(1);
  }

  const origin = mediaOrigin();
  let absoluteUrl;

  if (fileOrUrlArg && /^https?:\/\//i.test(fileOrUrlArg)) {
    absoluteUrl = fileOrUrlArg;
  } else {
    const uploadRel = process.env.UPLOAD_DIR || "uploads";
    const uploadsDir = path.resolve(__dirname, "..", uploadRel);
    const fn =
      fileOrUrlArg ||
      pickLatestUpload(uploadsDir) ||
      (() => {
        throw new Error(
          `No image in ${uploadsDir}. Pass an upload basename or full http(s) URL.`,
        );
      })();
    if (!/^https?:\/\//i.test(String(fn))) {
      absoluteUrl = `${origin}/frame-media/${encodeURIComponent(fn)}`;
    } else {
      absoluteUrl = fn;
    }
  }

  let fbHost = "";
  let fbPort = 80;
  try {
    const o = new URL(origin + "/");
    fbHost = o.hostname;
    fbPort = o.port ? Number(o.port) : o.protocol === "https:" ? 443 : 80;
  } catch {
    /* noop */
  }

  const payload = buildPlayPayload(mac, absoluteUrl, fbHost, fbPort);
  const topic = `/inkjoyap/${mac}`;
  const body = JSON.stringify(payload);

  console.log("[cast-frame] MQTT publish:", topic);
  console.log("[cast-frame] Payload:", body);

  const user = process.env.MQTT_USER;
  const pass = process.env.MQTT_PASSWORD;

  await new Promise((resolve, reject) => {
    const clientId = `myframe_cast_${crypto.randomBytes(4).toString("hex")}`;
    const client = mqtt.connect(mqttUrl, {
      username: user || undefined,
      password: pass || undefined,
      clientId,
      reconnectPeriod: 0,
      connectTimeout: 10_000,
    });

    const t = setTimeout(() => {
      client.end(true);
      reject(new Error("MQTT connect timeout"));
    }, 12_000);

    client.once("connect", () => {
      client.publish(topic, body, { qos: 1 }, (err) => {
        clearTimeout(t);
        client.end();
        if (err) reject(err);
        else resolve();
      });
    });

    client.once("error", (err) => {
      clearTimeout(t);
      client.end(true);
      reject(err);
    });
  });

  console.log("[cast-frame] Done. Watch API logs (FRAME_MQTT_DEBUG=1) or frame ack.");
}

main().catch((e) => {
  console.error("[cast-frame] Error:", e.message || e);
  process.exit(1);
});
