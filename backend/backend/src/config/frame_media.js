"use strict";
/**
 * Frame image delivery (HTTP download + MQTT `play` host/port).
 *
 * - App / portal API: `PUBLIC_BASE_URL` -> usually `http://VPS:3001`
 * - Frame firmware: fetches `/frame-media/*.bin` via MQTT `play` host/port
 *
 * Never send port 3001 in MQTT `play` -- the Express API does not serve frame binaries
 * the way Nginx does on port 80.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizedFrameMediaBaseUrl = normalizedFrameMediaBaseUrl;
exports.frameMediaPlayEndpoint = frameMediaPlayEndpoint;
exports.warnIfMisconfiguredFrameMediaEnv = warnIfMisconfiguredFrameMediaEnv;
const API_LISTEN_PORT = 3001;
const DEFAULT_FRAME_HTTP_PORT = 80;
function envPort(name, fallback) {
    const n = Number.parseInt(String(process.env[name] ?? "").trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}
/** Public base for `/frame-media/...` links in API responses (no trailing slash). */
function normalizedFrameMediaBaseUrl(fallback) {
    const envRaw = (process.env.PUBLIC_MEDIA_BASE_URL ?? "").trim();
    if (envRaw) {
        return envRaw.replace(/\/$/, "");
    }
    const pub = (process.env.PUBLIC_BASE_URL ?? "").trim();
    if (pub) {
        return pub.replace(/\/$/, "");
    }
    if (fallback) {
        return fallback.replace(/\/$/, "");
    }
    return "";
}
/** Host + port embedded in every MQTT `play` command. */
function frameMediaPlayEndpoint() {
    const playHost = (process.env.FRAME_MEDIA_PLAY_HOST ?? "").trim();
    const mqttOverride = envPort("FRAME_MQTT_PORT", 0);
    let port = mqttOverride > 0 ? mqttOverride : DEFAULT_FRAME_HTTP_PORT;
    if (port === 1883 || port === 3001) {
        console.warn("[myframe] frameMediaPlayEndpoint: port " + port + " is invalid for HTTP media, falling back to " + DEFAULT_FRAME_HTTP_PORT);
        port = DEFAULT_FRAME_HTTP_PORT;
    }
    if (playHost) {
        return { host: playHost, port };
    }
    const base = normalizedFrameMediaBaseUrl();
    if (!base) {
        throw new Error("PUBLIC_MEDIA_BASE_URL_or_PUBLIC_BASE_URL_required_for_mqtt_play");
    }
    const u = new URL(base);
    const protocol = u.protocol || "http:";
    const protocolDefaultPort = protocol === "https:" ? 443 : DEFAULT_FRAME_HTTP_PORT;
    const fromUrl = u.port ? Number.parseInt(u.port, 10) : protocolDefaultPort;
    port = mqttOverride > 0 ? mqttOverride : fromUrl || DEFAULT_FRAME_HTTP_PORT;
    if (port === 1883 || port === 3001) {
        port = DEFAULT_FRAME_HTTP_PORT;
    }
    return { host: u.hostname, port };
}
function warnIfMisconfiguredFrameMediaEnv() {
    const media = (process.env.PUBLIC_MEDIA_BASE_URL ?? "").trim();
    if (media.includes(`:${API_LISTEN_PORT}`)) {
        console.warn(`[myframe] PUBLIC_MEDIA_BASE_URL uses :${API_LISTEN_PORT}; frame casts are normalized to port ${DEFAULT_FRAME_HTTP_PORT} (Nginx /frame-media/). Set PUBLIC_MEDIA_BASE_URL=http://<host> with no API port.`);
    }
}
