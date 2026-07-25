import express from "express";
import { Router } from "express";
import { db } from "../db/store";
import { verifyUserJwtBearer } from "../services/app_user_jwt";
import { publishSleepConfig, publishMqttAction, isMqttConnected } from "../services/frame_mqtt";

function normalizeMacKey(raw: string): string {
  try {
    return decodeURIComponent(raw).replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  } catch {
    return raw.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  }
}

var TIME_RE = /^\d{2}:\d{2}$/;

export function frameSleepRouter(): Router {
  var router = Router();
  router.use(express.json({ limit: "128kb" }));

  router.get("/frames/:mac/sleep-config", function(req, res) {
    var u = verifyUserJwtBearer(req);
    if (!u) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
    var macKey = normalizeMacKey(String(req.params.mac ?? ""));
    if (macKey.length < 8) {
      res.status(400).json({ ok: false, error: "invalid_mac" });
      return;
    }
    var data = db.read();
    var frame = data.frames.find(function(f) {
      return normalizeMacKey(f.id) === macKey || normalizeMacKey(f.bleMac) === macKey;
    });
    if (!frame) {
      res.status(404).json({ ok: false, error: "frame_not_found" });
      return;
    }
    res.json({
      ok: true,
      sleepConfig: frame.sleepConfig || { enabled: false, startTime: "23:00", endTime: "07:00" },
    });
  });

  router.post("/frames/:mac/sleep-config", function(req, res) {
    var u = verifyUserJwtBearer(req);
    if (!u) {
      res.status(401).json({ ok: false, error: "unauthorized" });
      return;
    }
    var macKey = normalizeMacKey(String(req.params.mac ?? ""));
    if (macKey.length < 8) {
      res.status(400).json({ ok: false, error: "invalid_mac" });
      return;
    }
    var body = req.body || {};
    var enabled = body.enabled === true || body.enabled === "true";
    var startTime = String(body.startTime ?? "").trim();
    var endTime = String(body.endTime ?? "").trim();
    if (!TIME_RE.test(startTime)) {
      res.status(422).json({ ok: false, error: "invalid_start_time", message: "Use HH:MM format" });
      return;
    }
    if (!TIME_RE.test(endTime)) {
      res.status(422).json({ ok: false, error: "invalid_end_time", message: "Use HH:MM format" });
      return;
    }
    var publishMac = macKey;
    var sleepConfig = { enabled: enabled, startTime: startTime, endTime: endTime };
    db.mutate(function(draft) {
      var frame = draft.frames.find(function(f) {
        return normalizeMacKey(f.id) === macKey || normalizeMacKey(f.bleMac) === macKey;
      });
      if (frame) {
        frame.sleepConfig = sleepConfig;
        if (frame.stationMac) publishMac = frame.stationMac;
      }
    });
    publishSleepConfig(publishMac, sleepConfig).catch(function() {});
  if (isMqttConnected()) {
    var immAction = enabled ? "sleep" : "wake";
    publishMqttAction(publishMac, immAction).catch(function() {});
  }
    res.json({ ok: true, sleepConfig: sleepConfig });
  });

  return router;
}
