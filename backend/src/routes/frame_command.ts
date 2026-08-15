"use strict";
import express from "express";
import { Router } from "express";
import { db } from "../db/store";
import { requirePairingToken } from "../middleware/security";
import {
  getFrame,
  isMqttConnected,
  publishFrameCommand,
} from "../services/frame_mqtt";

function normalizeMacKey(raw: string): string {
  try {
    return decodeURIComponent(raw).replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  } catch {
    return raw.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  }
}

const TIME_RE = /^\d{2}:\d{2}$/;
const ALLOWED_ACTIONS = new Set(["wifi_sleep", "strategy_bin"]);

function validateActionPayload(action: string, data: Record<string, unknown>): string | null {
  const begintime = String(data.begintime ?? "");
  const endtime = String(data.endtime ?? "");
  if (!TIME_RE.test(begintime) || !TIME_RE.test(endtime)) {
    return "begintime/endtime must use HH:MM format";
  }
  if (action === "strategy_bin") {
    const idle = data.idle;
    const strategy = data.strategy;
    if (idle !== 1 && idle !== 0 && idle !== "1" && idle !== "0") {
      return "strategy_bin.data.idle must be 1 or 0";
    }
    if (strategy !== 1 && strategy !== 2 && strategy !== "1" && strategy !== "2") {
      return "strategy_bin.data.strategy must be 1 or 2";
    }
  } else if (action === "wifi_sleep") {
    const mode = Number(data.mode);
    if (mode !== 0 && mode !== 1 && mode !== 2) {
      return "wifi_sleep.data.mode must be 0, 1, or 2";
    }
    if (mode !== 0 && begintime === endtime) {
      return "begintime and endtime must not be identical";
    }
  }
  return null;
}

/**
 * POST /api/frames/:mac/mqtt-command
 * Relay an app-issued MQTT payload (`wifi_sleep`) to /inkjoyap/{MAC}
 * and briefly poll /device/report for the ack result (100/113 = success, 112 = failure).
 * Guarded by the shared pairing token (same as /mqtt-config).
 */
export function frameCommandRouter(): Router {
  const router = Router();
  router.use(express.json({ limit: "128kb" }));

  router.post("/frames/:mac/mqtt-command", requirePairingToken, async function (req, res) {
    const macKey = normalizeMacKey(String(req.params.mac ?? ""));
    if (macKey.length < 8) {
      res.status(400).json({ ok: false, error: "invalid_mac" });
      return;
    }
    const body = req.body || {};
    const action = String(body.action ?? "").trim();
    if (!ALLOWED_ACTIONS.has(action)) {
      res
        .status(422)
        .json({ ok: false, error: "invalid_action", message: "action must be wifi_sleep or strategy_bin" });
      return;
    }
    const data = (body.data && typeof body.data === "object" ? body.data : {}) as Record<string, unknown>;
    const validationErr = validateActionPayload(action, data);
    if (validationErr) {
      res.status(422).json({ ok: false, error: "invalid_data", message: validationErr });
      return;
    }
    const msgid = typeof body.msgid === "string" && body.msgid ? body.msgid : Date.now().toString();
    if (!isMqttConnected()) {
      res.status(503).json({ ok: false, error: "mqtt_not_connected" });
      return;
    }
    if (action === "wifi_sleep") {
      db.mutate((draft) => {
        if (!draft.wifiSleepByBleMac) draft.wifiSleepByBleMac = {};
        draft.wifiSleepByBleMac[macKey] = {
          mode: Number(data.mode),
          begintime: String(data.begintime ?? "00:00"),
          endtime: String(data.endtime ?? "00:00"),
          updatedAtMs: Date.now(),
        };
      });
    }
    try {
      await publishFrameCommand(macKey, action, data, msgid);
    } catch (e) {
      res.status(502).json({ ok: false, error: "publish_failed", message: String((e as Error)?.message || e) });
      return;
    }

    const deadline = Date.now() + 4000;
    const ack = await (async () => {
      while (Date.now() < deadline) {
        const rec = getFrame(macKey);
        if (rec && rec.lastAction === action && rec.lastResult !== undefined && rec.lastResult !== null) {
          return { action: rec.lastAction, result: rec.lastResult };
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      return null;
    })();

    res.json({ ok: true, sent: true, action, msgid, ack });
  });

  return router;
}
