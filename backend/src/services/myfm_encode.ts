/**
 * XT ePaper 13.3″ E6 (spec 13.3E6 § bin): 4-byte BE header only + packed 4bpp payload.
 * — No MYFM magic, no CRC.
 * — Pixel order: left half (cols 0–599 × all rows) then right half (600–1199 × all rows), not full-width row-major.
 * — Two pixels per byte: high nibble first, low nibble second along each packed stream.
 * — Palette indices: 0 black, 1 white, 2 yellow, 3 red, 5 blue, 6 green (index 4 unused).
 *
 * Locked with `app/lib/services/image_processor_service.dart`.
 */

import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

export const FRAME_W = 1200;
export const FRAME_H = 1600;

const HALF_W = FRAME_W >>> 1; // 600
const NIBBLES_PER_HALF = HALF_W * FRAME_H;
const PACKED_HALF_LEN = NIBBLES_PER_HALF >>> 1;

export const XT_BIN_PAYLOAD_BYTES = PACKED_HALF_LEN * 2;
/** Official device file size: 4-byte header + 960_000-byte payload */
export const XT_BIN_TOTAL_BYTES = 4 + XT_BIN_PAYLOAD_BYTES;

/** [hardware index, R, G, B] — index 4 deliberately omitted (invalid). */
const XT_PALETTE: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 0, 0, 0],
  [1, 255, 255, 255],
  [2, 255, 255, 0],
  [3, 255, 0, 0],
  [5, 0, 0, 255],
  [6, 0, 255, 0],
];

function nearestXtPaletteIndex(r: number, g: number, b: number): number {
  let bestIdx = 0;
  let bestD = 1 << 30;
  for (let j = 0; j < XT_PALETTE.length; j++) {
    const [hw, pr, pg, pb] = XT_PALETTE[j];
    const dr = r - pr;
    const dg = g - pg;
    const db = b - pb;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) {
      bestD = d;
      bestIdx = hw;
    }
  }
  return bestIdx;
}

function packNibblePairs(indices: Uint8Array): Uint8Array {
  if (indices.length !== NIBBLES_PER_HALF) {
    throw new Error(`expected ${NIBBLES_PER_HALF} nibbles, got ${indices.length}`);
  }
  const out = new Uint8Array(PACKED_HALF_LEN);
  for (let i = 0, o = 0; i < indices.length; i += 2, o++) {
    const hi = indices[i]! & 0xf;
    const lo = indices[i + 1]! & 0xf;
    out[o] = (hi << 4) | lo;
  }
  return out;
}

/**
 * RGB raster (row-major RGB triples) → official `.bin` body (starts with 4 BE uint16 header when concatenated externally).
 */
export function encodeMyfmFromRgb(raw: Uint8Array, stride: number, width: number, height: number): Buffer {
  if (width !== FRAME_W || height !== FRAME_H) {
    throw new Error(`MYFM raster must be ${FRAME_W}×${FRAME_H}, got ${width}×${height}`);
  }
  const px = width * height;
  const rgb = new Uint8Array(px * 3);
  for (let i = 0; i < px; i++) {
    const o = i * stride;
    rgb[i * 3] = raw[o];
    rgb[i * 3 + 1] = raw[o + 1];
    rgb[i * 3 + 2] = raw[o + 2];
  }

  const left = new Uint8Array(NIBBLES_PER_HALF);
  const right = new Uint8Array(NIBBLES_PER_HALF);

  let li = 0;
  let ri = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < HALF_W; x++) {
      const i = y * width + x;
      left[li++] = nearestXtPaletteIndex(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
    }
    for (let x = HALF_W; x < width; x++) {
      const i = y * width + x;
      right[ri++] = nearestXtPaletteIndex(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
    }
  }

  const header = Buffer.alloc(4);
  header.writeUInt16BE(FRAME_W, 0);
  header.writeUInt16BE(FRAME_H, 2);

  const leftPacked = packNibblePairs(left);
  const rightPacked = packNibblePairs(right);

  const out = Buffer.allocUnsafe(XT_BIN_TOTAL_BYTES);
  header.copy(out, 0, 0, 4);
  Buffer.from(leftPacked).copy(out, 4, 0, PACKED_HALF_LEN);
  Buffer.from(rightPacked).copy(out, 4 + PACKED_HALF_LEN, 0, PACKED_HALF_LEN);

  if (out.length !== XT_BIN_TOTAL_BYTES) {
    throw new Error(`XT .bin length mismatch: got ${out.length}, expected ${XT_BIN_TOTAL_BYTES}`);
  }
  return out;
}

/** True if buffer matches 13.3E6 official layout (4-byte dims + payload size). */
export function isProbablyMyfmBuffer(buf: Buffer): boolean {
  return buf.length === XT_BIN_TOTAL_BYTES && buf.readUInt16BE(0) === FRAME_W && buf.readUInt16BE(2) === FRAME_H;
}

/** Raster → XT `.bin` sidecar next to uploaded JPEG/PNG (`<stem>.bin`). */
export async function writeMyfmSidecar(uploadedAbsPath: string): Promise<string> {
  const meta = await sharp(uploadedAbsPath).metadata();
  let pipeline = sharp(uploadedAbsPath).rotate().resize(FRAME_W, FRAME_H, {
    fit: "cover",
    position: "centre",
  });
  if (meta.hasAlpha) {
    pipeline = pipeline.ensureAlpha().flatten({ background: { r: 255, g: 255, b: 255 } });
  }
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });

  const ch = info.channels ?? 0;
  if (ch < 3) {
    throw new Error(`need at least 3 channels after processing, got ${ch}`);
  }
  const stride = ch;
  const out = encodeMyfmFromRgb(new Uint8Array(data), stride, info.width, info.height);

  if (out.length !== XT_BIN_TOTAL_BYTES) {
    throw new Error(`MYFM payload size mismatch: got ${out.length}, expected ${XT_BIN_TOTAL_BYTES}`);
  }

  const stem = path.parse(uploadedAbsPath).name;
  const binPath = path.join(path.dirname(uploadedAbsPath), `${stem}.bin`);
  await fs.writeFile(binPath, out);

  return `${stem}.bin`;
}
