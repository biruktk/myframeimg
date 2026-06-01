/**
 * Frame image delivery (HTTP download + MQTT `play` host/port).
 *
 * - App / portal API: `PUBLIC_BASE_URL` → usually `http://VPS:3001`
 * - Frame firmware: fetches `/frame-media/*.bin` on port 80 (Nginx → `backend/uploads/`)
 *
 * Never send port 3001 in MQTT `play` — the Express API does not serve frame binaries
 * the way Nginx does on port 80.
 */

const API_LISTEN_PORT = 3001;
const DEFAULT_FRAME_HTTP_PORT = 80;

function envPort(name: string, fallback: number): number {
  const n = Number.parseInt(String(process.env[name] ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Public base for `/frame-media/...` links in API responses (no trailing slash). */
export function normalizedFrameMediaBaseUrl(fallback?: string): string {
  const raw =
    (process.env.PUBLIC_MEDIA_BASE_URL ?? "").trim() ||
    (process.env.PUBLIC_BASE_URL ?? "").trim() ||
    (fallback ?? "").trim();
  if (!raw) return "";

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw.replace(/\/$/, "");
  }

  const forcedPort = envPort("FRAME_MEDIA_PORT", DEFAULT_FRAME_HTTP_PORT);
  let port = u.port ? Number.parseInt(u.port, 10) : 0;
  if (!port || port === API_LISTEN_PORT) port = forcedPort;

  const protocol = u.protocol || "http:";
  if (port === 80 && protocol === "http:") return `${protocol}//${u.hostname}`;
  if (port === 443 && protocol === "https:") return `${protocol}//${u.hostname}`;
  return `${protocol}//${u.hostname}:${port}`;
}

/** Host + port embedded in every MQTT `play` command. */
export function frameMediaPlayEndpoint(): { host: string; port: number } {
  const base = normalizedFrameMediaBaseUrl();
  if (!base) {
    throw new Error("PUBLIC_MEDIA_BASE_URL_or_PUBLIC_BASE_URL_required_for_mqtt_play");
  }
  const u = new URL(base);
  const mqttOverride = envPort("FRAME_MQTT_PORT", 0);
  const fromUrl = u.port ? Number.parseInt(u.port, 10) : DEFAULT_FRAME_HTTP_PORT;
  const port = mqttOverride > 0 ? mqttOverride : fromUrl || DEFAULT_FRAME_HTTP_PORT;
  return { host: u.hostname, port };
}

export function warnIfMisconfiguredFrameMediaEnv(): void {
  const media = (process.env.PUBLIC_MEDIA_BASE_URL ?? "").trim();
  if (media.includes(`:${API_LISTEN_PORT}`)) {
    console.warn(
      `[myframe] PUBLIC_MEDIA_BASE_URL uses :${API_LISTEN_PORT}; frame casts are normalized to port ${DEFAULT_FRAME_HTTP_PORT} (Nginx /frame-media/). Set PUBLIC_MEDIA_BASE_URL=http://<host> with no API port.`,
    );
  }
}
