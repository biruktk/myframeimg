export interface FrameLogEntry {
  id: string;
  timestamp: string;
  level: "info" | "warn" | "error" | "debug";
  source: string;
  message: string;
  frameId: string;
}

export const DOC_VERSION = "1.0.0";

export const FRAME_STATUS_CODES: Record<string, string> = {
  online: "Frame is connected and powered on",
  offline: "Frame is disconnected (no heartbeat for 5+ minutes)",
  low_battery: "Frame is online but battery is below 20%",
  updating: "Firmware update in progress",
  sleeping: "Frame is in power-saving sleep mode (E Ink display retains image)",
};

export const EVENT_TYPES: { event: string; description: string }[] = [
  { event: "photo.uploaded", description: "A photo was uploaded to a frame" },
  { event: "frame.online", description: "Frame came online after being offline" },
  { event: "frame.offline", description: "Frame disconnected or went offline" },
  { event: "battery.low", description: "Frame battery dropped below 20%" },
  { event: "ai.art.generated", description: "AI art generation completed on a frame" },
  { event: "family.member.added", description: "A new family member was invited to a frame" },
  { event: "photo.deleted", description: "A photo was removed from a frame" },
  { event: "sync.completed", description: "Frame completed a full sync cycle" },
];

export const UPLOAD_METHODS: { method: string; description: string }[] = [
  { method: "Mobile App", description: "Upload via iOS/Android MyFrame app" },
  { method: "WeChat Mini Program", description: "Upload via WeChat Mini Program" },
  { method: "Email", description: "Email photos to your frame's unique email address" },
  { method: "SMS", description: "Send photos via MMS/SMS" },
  { method: "WhatsApp", description: "Send photos via WhatsApp bot" },
  { method: "Google Photos", description: "Auto-sync from Google Photos albums" },
  { method: "SD Card", description: "Direct read from SD card (offline)" },
  { method: "Web Dashboard", description: "Upload via myframe.ink web portal" },
  { method: "API", description: "Programmatic upload via MyFrame REST API" },
];

export const AI_STYLES: { id: string; name: string; description: string }[] = [
  { id: "watercolor", name: "Watercolor", description: "Soft, flowing washes of color with organic edges" },
  { id: "oil_painting", name: "Oil Painting", description: "Rich textures with visible brush strokes" },
  { id: "sketch", name: "Sketch", description: "Fine pencil-like lines with cross-hatching" },
  { id: "impressionist", name: "Impressionist", description: "Small, thin brush strokes in open composition" },
  { id: "pop_art", name: "Pop Art", description: "Bold colors and halftone patterns" },
  { id: "minimal", name: "Minimal", description: "Clean lines, negative space, simple color palette" },
  { id: "abstract", name: "Abstract", description: "Non-representational forms and geometric shapes" },
];

export const ERROR_CODES: { code: number; meaning: string }[] = [
  { code: 400, meaning: "Bad request — invalid parameters" },
  { code: 401, meaning: "Unauthorized — API key missing or invalid" },
  { code: 403, meaning: "Forbidden — insufficient permissions" },
  { code: 404, meaning: "Frame or resource not found" },
  { code: 409, meaning: "Conflict — resource already exists" },
  { code: 422, meaning: "Unprocessable entity — validation failed" },
  { code: 429, meaning: "Rate limit exceeded — too many requests" },
  { code: 500, meaning: "Internal server error" },
  { code: 502, meaning: "Bad gateway — upstream service unavailable" },
  { code: 503, meaning: "Service temporarily unavailable" },
];

export const MOCK_FRAME_LOGS: FrameLogEntry[] = [
  { id: "log_001", timestamp: "14:23:45", level: "info", source: "S133-9A2B", message: "Photo synced: 3 new images from WeChat Mini Program", frameId: "s133-9a2b" },
  { id: "log_002", timestamp: "14:22:10", level: "info", source: "S133-4C7D", message: "Heartbeat received — battery 87%, Wi-Fi -52dBm", frameId: "s133-4c7d" },
  { id: "log_003", timestamp: "14:20:33", level: "warn", source: "S133-6E1F", message: "Battery level below 20% — 18% remaining", frameId: "s133-6e1f" },
  { id: "log_004", timestamp: "14:18:00", level: "info", source: "S133-2F8A", message: "AI art generated: \"Watercolor landscape\" (12.4s)", frameId: "s133-2f8a" },
  { id: "log_005", timestamp: "14:15:22", level: "debug", source: "S133-9A2B", message: "Wi-Fi scan: 6 networks available, RSSI -48dBm", frameId: "s133-9a2b" },
  { id: "log_006", timestamp: "14:12:47", level: "info", source: "S133-4C7D", message: "Family member added: \"Mom\" via invite link", frameId: "s133-4c7d" },
  { id: "log_007", timestamp: "14:10:05", level: "error", source: "S133-6E1F", message: "Image download failed: Connection timeout (retry 2/3)", frameId: "s133-6e1f" },
  { id: "log_008", timestamp: "14:08:30", level: "info", source: "S133-2F8A", message: "Photo uploaded via email: \"DSC_0421.JPG\" (4.2MB)", frameId: "s133-2f8a" },
  { id: "log_009", timestamp: "14:05:12", level: "warn", source: "S133-9A2B", message: "SD card usage: 87% full (26.3GB / 30GB)", frameId: "s133-9a2b" },
  { id: "log_010", timestamp: "14:02:00", level: "info", source: "S133-4C7D", message: "Frame boot complete. Firmware v2.4.1", frameId: "s133-4c7d" },
  { id: "log_011", timestamp: "13:58:45", level: "debug", source: "S133-6E1F", message: "Display refresh cycle started — E Ink full update", frameId: "s133-6e1f" },
  { id: "log_012", timestamp: "13:55:20", level: "info", source: "S133-2F8A", message: "Google Photos sync: 12 new photos from \"Summer 2026\"", frameId: "s133-2f8a" },
];
