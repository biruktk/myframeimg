import type { DemoStep } from "../types";

export const DEMO_STEPS: DemoStep[] = [
  {
    id: "demo-health",
    title: "Step 1: Check Backend",
    description: "Verify the Express API is reachable through the Next.js proxy before calling admin routes.",
    apis: ["backend_health"],
  },
  {
    id: "demo-login",
    title: "Step 2: Admin Session",
    description:
      "Sign in with admin / admin (local defaults). The session cookie authorizes fleet and admin endpoints in this portal.",
    apis: ["devs_status"],
  },
  {
    id: "demo-frames",
    title: "Step 3: Inspect Fleet",
    description: "Load registered frames and fleet overview metrics from the real JSON database synced from VPS.",
    apis: ["admin_frames", "fleet_overview"],
  },
  {
    id: "demo-device",
    title: "Step 4: Device Snapshot",
    description: "Read the primary paired device status — connection, storage, and photo count as shown in the user app.",
    apis: ["device_status"],
  },
  {
    id: "demo-send",
    title: "Step 5: Push to Frame",
    description:
      "Send a frame-media URL via MQTT play. Requires MQTT connected on the backend and a valid deviceId from List Frames.",
    apis: ["device_send"],
  },
  {
    id: "demo-logs",
    title: "Step 6: Monitor Logs",
    description: "Query historical MQTT logs and watch the live SSE stream in the debug console for rx/tx traffic.",
    apis: ["devs_logs", "devs_status"],
  },
];
