/**
 * Published frame firmware releases served at `/firmware/{filename}` (Nginx → uploads/firmware).
 * Override via env for production without redeploying code.
 */

export type FirmwareRelease = {
  version: string;
  filename: string;
  releaseNotes: string;
  sizeBytes: number;
  publishedAtMs: number;
};

const DEFAULT_RELEASE: FirmwareRelease = {
  version: "1.4.3",
  filename: "myframe-firmware-1.4.3.bin",
  releaseNotes:
    "Faster e-ink refresh, MQTT reconnect stability, SD card cleanup, WeChat QR invite, improved sleep/wake schedule.",
  sizeBytes: 2_400_000,
  publishedAtMs: Date.UTC(2026, 5, 9),
};

export function latestFirmwareRelease(): FirmwareRelease {
  const version = String(process.env.FIRMWARE_LATEST_VERSION ?? DEFAULT_RELEASE.version).trim() || DEFAULT_RELEASE.version;
  const filename =
    String(process.env.FIRMWARE_BIN_FILENAME ?? DEFAULT_RELEASE.filename).trim() || DEFAULT_RELEASE.filename;
  const releaseNotes = String(process.env.FIRMWARE_RELEASE_NOTES ?? DEFAULT_RELEASE.releaseNotes).trim();
  const sizeBytes = Number(process.env.FIRMWARE_SIZE_BYTES ?? DEFAULT_RELEASE.sizeBytes) || DEFAULT_RELEASE.sizeBytes;
  return {
    version: version.replace(/^v/i, ""),
    filename,
    releaseNotes,
    sizeBytes,
    publishedAtMs: DEFAULT_RELEASE.publishedAtMs,
  };
}

/** Compare semver-ish strings; returns true when [candidate] is newer than [current]. */
export function isFirmwareVersionNewer(candidate: string, current: string): boolean {
  const parse = (raw: string): number[] =>
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

export function normalizeFirmwareVersion(raw: string | null | undefined): string {
  const v = String(raw ?? "").trim().replace(/^v/i, "");
  return v || "0.0.0";
}
