import { Router } from "express";
import { requireAdminToken } from "../middleware/security";
import {
  inkjoyEnabled,
  inkjoyListDevices,
  inkjoyPublishImage,
  resolveInkjoyDeviceId,
} from "../services/inkjoy_client";

export const inkjoyRouter = Router();
inkjoyRouter.use(requireAdminToken);

inkjoyRouter.get("/inkjoy/status", (_req, res) => {
  res.json({
    ok: true,
    enabled: inkjoyEnabled(),
    configured: {
      email: Boolean(process.env.INKJOY_EMAIL),
      password: Boolean(process.env.INKJOY_PASSWORD),
      deviceId: Boolean(process.env.INKJOY_DEVICE_ID),
    },
  });
});

inkjoyRouter.get("/inkjoy/devices", async (_req, res) => {
  try {
    if (!inkjoyEnabled()) {
      res.status(400).json({ ok: false, error: "inkjoy_not_enabled" });
      return;
    }
    const devices = await inkjoyListDevices();
    res.json({ ok: true, devices });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "inkjoy_devices_failed" });
  }
});

inkjoyRouter.post("/inkjoy/publish", async (req, res) => {
  try {
    if (!inkjoyEnabled()) {
      res.status(400).json({ ok: false, error: "inkjoy_not_enabled" });
      return;
    }
    const deviceId = resolveInkjoyDeviceId(req.body?.device_id);
    const imageBase64 = String(req.body?.image_base64 ?? "");
    if (!deviceId || !imageBase64) {
      res.status(400).json({ ok: false, error: "device_id_and_image_base64_required" });
      return;
    }
    const bytes = Buffer.from(imageBase64, "base64");
    const out = await inkjoyPublishImage({
      deviceId,
      filename: String(req.body?.filename ?? "image.jpg"),
      bytes,
    });
    res.json({ ok: true, result: out });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "inkjoy_publish_failed" });
  }
});
