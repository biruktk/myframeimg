import type { Api } from "../types";

/** API catalog — paths match Next.js proxies; live samples loaded via GET /api/devs/bootstrap. */
export const DEV_APIS: Api[] = [
  {
    id: "devs_status",
    name: "开发者状态",
    nameEn: "Fleet & MQTT Status",
    category: "Device Logs",
    method: "GET",
    url: "/api/devs/status",
    proxyPath: "/api/devs/status",
    auth: "admin",
    description:
      "Live fleet telemetry: MQTT broker connection, registered frames, online clients, messages per minute, and per-frame MQTT heartbeat.",
    responseNote:
      "Fields: ok, mqtt{connected,brokerUrl,liveFrameCount,mqttOnlineCount}, messagesPerMin, totalLogEntries, connectedClients, registeredFrames, liveFrames[], frames[]",
    params: [],
    responseExample: "",
    dependencies: [],
  },
  {
    id: "devs_logs",
    name: "设备日志",
    nameEn: "Frame MQTT Logs",
    category: "Device Logs",
    method: "GET",
    url: "/api/devs/logs",
    proxyPath: "/api/devs/logs",
    auth: "admin",
    description:
      "In-memory frame log ring buffer (MQTT rx/tx, photo pushes). Filters by MAC, frame name, or free-text search.",
    responseNote: "Fields: ok, items[{id,atMs,direction,mac,frameName,topic,action,payload}], total",
    params: [
      { name: "mac", required: false, type: "string", description: "BLE/MQTT MAC filter (hex)", defaultValue: "" },
      { name: "name", required: false, type: "string", description: "Frame display name filter", defaultValue: "" },
      { name: "q", required: false, type: "string", description: "Full-text search across topic/payload", defaultValue: "" },
      { name: "limit", required: false, type: "integer", description: "Max entries (default 500)", defaultValue: "50" },
    ],
    responseExample: "",
    dependencies: ["devs_status"],
  },
  {
    id: "backend_health",
    name: "后端健康",
    nameEn: "Backend Health",
    category: "Device Logs",
    method: "GET",
    url: "/api/backend-health",
    proxyPath: "/api/backend-health",
    auth: "none",
    description: "Checks Express API reachability (GET /health on MYFRAME_API_URL).",
    responseNote: "Fields: ok, upstream, base, upstreamBody{ok,service,wechatConfigured,googleAuthConfigured,...}",
    params: [],
    responseExample: "",
    dependencies: [],
  },
  {
    id: "admin_frames",
    name: "设备列表",
    nameEn: "List Frames (Admin)",
    category: "Frame Management",
    method: "GET",
    url: "/api/admin/frames",
    proxyPath: "/api/admin/frames",
    auth: "admin",
    description:
      "Frame registry from JSON store: id, bleMac, wifiStatus, firmwareVersion, ota, owner, bleProvisionLogs.",
    responseNote: "Returns array of frame objects (not wrapped in {items}). Optional filter: offline_7d | never_sent_photo",
    params: [
      {
        name: "filter",
        required: false,
        type: "string",
        description: "offline_7d | never_sent_photo",
        defaultValue: "",
      },
    ],
    responseExample: "",
    dependencies: [],
  },
  {
    id: "fleet_overview",
    name: "机群概览",
    nameEn: "Fleet Overview",
    category: "Frame Management",
    method: "GET",
    url: "/api/admin/fleet/overview",
    proxyPath: "/api/admin/fleet/overview",
    auth: "admin",
    description: "Aggregated fleet metrics from registered frames.",
    responseNote:
      "Fields: totalFrames, onlineNow, offline, neverProvisioned, dailyActiveFrames, firmwareDistribution{}, locations[]",
    params: [],
    responseExample: "",
    dependencies: ["admin_frames"],
  },
  {
    id: "device_status",
    name: "设备状态",
    nameEn: "Primary Device Status",
    category: "Frame Management",
    method: "GET",
    url: "/api/device/status",
    proxyPath: "/api/device/status",
    auth: "none",
    description: "Primary paired device snapshot used by the user app.",
    responseNote:
      "Fields: connected, deviceId, deviceName, room, lastPhotoHours, storageGb, photoCount, uptimeDays, transport{wifi,bluetooth}",
    params: [],
    responseExample: "",
    dependencies: [],
  },
  {
    id: "admin_overview",
    name: "管理概览",
    nameEn: "Admin Dashboard Overview",
    category: "Frame Management",
    method: "GET",
    url: "/api/admin/overview",
    proxyPath: "/api/admin/overview",
    auth: "admin",
    description: "CMS device + upload summary from the backend store (used by /admin dashboard).",
    responseNote:
      "Fields: totalUploads, totalFaqs, photoCount, lastPhotoAtMs, connected, deviceId, deviceName, deviceSn, usedBytes, capacityBytes",
    params: [],
    responseExample: "",
    dependencies: [],
  },
  {
    id: "device_send",
    name: "推送照片",
    nameEn: "Send Photo to Frame",
    category: "Photo Management",
    method: "POST",
    url: "/api/device/send",
    proxyPath: "/api/device/send",
    auth: "none",
    description: "Push a photo URL to the frame via MQTT play command.",
    requestNote: "Requires MQTT connected. deviceId defaults to live primary device from bootstrap.",
    responseNote: "Fields: ok, deviceId, imageUrl (on success) or ok:false, error",
    params: [
      { name: "deviceId", required: true, type: "string", description: "Frame/device ID (live default pre-filled)", defaultValue: "" },
      {
        name: "image_url",
        required: false,
        type: "string",
        description: "Public frame-media URL; defaults to latest upload",
        defaultValue: "",
      },
    ],
    responseExample: "",
    dependencies: ["admin_frames", "device_status"],
  },
  {
    id: "admin_users",
    name: "用户列表",
    nameEn: "List Users (Admin)",
    category: "Family Management",
    method: "GET",
    url: "/api/admin/users",
    proxyPath: "/api/admin/users",
    auth: "admin",
    description: "Paginated users with frames and familyGroup embedded.",
    responseNote: "Fields: items[{id,email,name,subscriptionTier,frames[],familyGroup}], total, page, pageSize",
    params: [
      { name: "q", required: false, type: "string", description: "Search query", defaultValue: "" },
      { name: "page", required: false, type: "integer", description: "Page number", defaultValue: "1" },
      { name: "pageSize", required: false, type: "integer", description: "Results per page (max 100)", defaultValue: "25" },
    ],
    responseExample: "",
    dependencies: [],
  },
];

export function groupApisByCategory(): Record<string, Api[]> {
  const grouped: Record<string, Api[]> = {};
  for (const api of DEV_APIS) {
    if (!grouped[api.category]) grouped[api.category] = [];
    grouped[api.category].push(api);
  }
  return grouped;
}
