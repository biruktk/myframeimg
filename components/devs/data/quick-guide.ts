import type { QuickGuideItem } from "../types";

export const QUICK_GUIDE_ITEMS: QuickGuideItem[] = [
  {
    id: "auth",
    title: "1. Authentication",
    content:
      "Admin-only endpoints require a signed-in CMS session. POST /api/admin/login with admin credentials sets an httpOnly cookie used by all /api/devs/* and /api/admin/* proxies.\n\nAlternatively, pass x-admin-token matching ADMIN_TOKEN in web/.env and backend/.env (default: framepass2026).",
  },
  {
    id: "base-url",
    title: "2. Base URL",
    content:
      "This portal executes live requests against the Next.js app origin (e.g. http://localhost:3000). Routes proxy to the Express API at MYFRAME_API_URL (default http://127.0.0.1:3001).\n\nOn VPS, both processes run behind nginx; pulled data reflects myframe-db.json and live MQTT traffic.",
  },
  {
    id: "request-format",
    title: "3. Request Format",
    content:
      "GET requests use query strings. POST/PUT send JSON bodies with Content-Type: application/json.\n\nPhoto upload (POST /api/photo/upload) uses multipart/form-data with x-pairing-token — use curl or the Send page for file uploads.",
  },
  {
    id: "live-logs",
    title: "4. Live Frame Logs",
    content:
<<<<<<< HEAD
      "Enable the debug console (bug icon) to stream MQTT/device traffic via GET /api/devs/logs/stream (Server-Sent Events).\n\nHistorical logs: GET /api/devs/logs with mac, name, q, and limit filters.",
=======
      "Enable the debug console (bug icon) to stream raw MQTT traffic via GET /api/devs/logs/stream?source=mqtt (Server-Sent Events).\n\nHistorical logs: GET /api/devs/logs with mac, name, q, source, and limit filters.",
>>>>>>> 48080f9811028793ad13ab3d10cbe435874d2f08
  },
  {
    id: "errors",
    title: "5. Error Handling",
    content:
      "Backend errors return JSON: { ok: false, error: \"error_key\" }\n\nCommon keys: admin_auth_required, mqtt_disconnected, missing_device_id, frame_not_found.\n\n502 from Next.js means the Express backend is unreachable — check npm run dev in backend/.",
  },
];
