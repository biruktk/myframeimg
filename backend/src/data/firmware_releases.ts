export type FirmwareRelease = {
  version: string;
  filename: string;
  releaseNotes: string;
  sizeBytes: number;
  publishedAtMs: number;
  /** Plain-HTTP host the ESP32 fetches the .bin from (no TLS, no DNS on device). */
  host: string;
  /** Plain-HTTP port (80). */
  port: number;
  /** URL path to the firmware binary. */
  path: string;
  /** Fully-qualified download URL (host + port + path). */
  downloadUrl: string;
};

const DEFAULT_RELEASE: FirmwareRelease = {
  version: "0.0.2",
  filename: "myframe-firmware-0.0.2.bin",
  releaseNotes:
    "1. Customizable default boot screen via down_int_img\n2. Added screen_size to login/heartbeat\n3. Exponential backoff for Wi-Fi reconnection (5s → 10s → 20s → 40s → 60s) with light sleep fallback\n4. Fixed 5-second long press reprovisioning\n5. MQTT topic unified to /myframe/{mac}\n6. BLUFI prefix unified as MF_\n7. Added MAC address display to provisioning page.",
  sizeBytes: 15728640,
  publishedAtMs: Date.UTC(2026, 8, 1),
  host: "47.76.164.162",
  port: 80,
  path: "/firmware/myframe-firmware-0.0.2.bin",
  downloadUrl: "http://47.76.164.162/firmware/myframe-firmware-0.0.2.bin",
};

export function latestFirmwareRelease(): FirmwareRelease {
  const version = String(process.env.FIRMWARE_LATEST_VERSION ?? DEFAULT_RELEASE.version).trim() || DEFAULT_RELEASE.version;
  const filename = String(process.env.FIRMWARE_BIN_FILENAME ?? DEFAULT_RELEASE.filename).trim() || DEFAULT_RELEASE.filename;
  const releaseNotes = String(process.env.FIRMWARE_RELEASE_NOTES ?? DEFAULT_RELEASE.releaseNotes).trim();
  const sizeBytes = Number(process.env.FIRMWARE_SIZE_BYTES ?? DEFAULT_RELEASE.sizeBytes) || DEFAULT_RELEASE.sizeBytes;
  const host = String(process.env.FIRMWARE_DOWNLOAD_HOST ?? DEFAULT_RELEASE.host).trim() || DEFAULT_RELEASE.host;
  const port = Number(process.env.FIRMWARE_DOWNLOAD_PORT ?? DEFAULT_RELEASE.port) || DEFAULT_RELEASE.port;
  const path = String(process.env.FIRMWARE_DOWNLOAD_PATH ?? DEFAULT_RELEASE.path).trim() || DEFAULT_RELEASE.path;
  const downloadUrl =
    String(process.env.FIRMWARE_DOWNLOAD_URL ?? "").trim() || `http://${host}:${port}${path}`;
  return {
    version: version.replace(/^v/i, ""),
    filename,
    releaseNotes,
    sizeBytes,
    publishedAtMs: DEFAULT_RELEASE.publishedAtMs,
    host,
    port,
    path,
    downloadUrl,
  };
}

export function isFirmwareVersionNewer(candidate: string, current: string): boolean {
  const parse = (raw: string) =>
    raw
      .replace(/^v/i, "")
      .split(/[.\-_]/)
      .map((part) => Number.parseInt(part.replace(/[^0-9].*$/, ""), 10))
      .map((n) => (Number.isFinite(n) ? n : 0));
  const a = parse(candidate);
  const b = parse(current);
  const len = Math.max(a.length, b.length, 3);
  for (let i = 0; i < len; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

export function normalizeFirmwareVersion(raw: string): string {
  const s = String(raw ?? "").trim();
  const m = s.match(/(\d+\.\d+\.\d+)/);
  const v = (m?.[1] ?? s).replace(/^v/i, "");
  return v || "0.0.0";
}
