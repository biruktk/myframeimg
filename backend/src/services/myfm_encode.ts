/**
 * MYFM `.bin` payload — must match `app/lib/services/image_processor_service.dart` (_buildMyfmBin / packing).
 */

import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

export const FRAME_W = 1200;
export const FRAME_H = 1600;

const EINK_PALETTE: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0],
  [255, 255, 255],
  [255, 0, 0],
  [255, 255, 0],
  [0, 255, 0],
  [0, 0, 255],
];

function nearestEinkIndex(r: number, g: number, b: number): number {
  let bestI = 0;
  let bestD = 1 << 30;
  for (let i = 0; i < EINK_PALETTE.length; i++) {
    const [pr, pg, pb] = EINK_PALETTE[i];
    const dr = r - pr;
    const dg = g - pg;
    const db = b - pb;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  return bestI;
}

function crc32Myfm(bytes: Uint8Array): number {
  const poly = 0xedb88320;
  let crc = 0xffffffff;
  for (let j = 0; j < bytes.length; j++) {
    crc ^= bytes[j];
    for (let i = 0; i < 8; i++) {
      crc = (crc & 1) !== 0 ? (crc >>> 1) ^ poly : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

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

  const byteLen = (px + 1) >> 1;
  const indexed = new Uint8Array(byteLen);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const idx = nearestEinkIndex(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
      const bi = i >> 1;
      if ((i & 1) === 0) {
        indexed[bi] = (indexed[bi] & 0xf0) | idx;
      } else {
        indexed[bi] = (indexed[bi] & 0x0f) | (idx << 4);
      }
    }
  }

  const head = Buffer.alloc(32);
  head[0] = 0x4d;
  head[1] = 0x59;
  head[2] = 0x46;
  head[3] = 0x4d;
  head[4] = 0x01;
  head[5] = (FRAME_W >> 8) & 0xff;
  head[6] = FRAME_W & 0xff;
  head[7] = (FRAME_H >> 8) & 0xff;
  head[8] = FRAME_H & 0xff;
  head[9] = 0x06;
  head[10] = 0x00;

  const forCrc = Buffer.allocUnsafe(28 + indexed.length);
  head.copy(forCrc, 0, 0, 28);
  Buffer.from(indexed).copy(forCrc, 28);
  const crc = crc32Myfm(forCrc);

  head[28] = (crc >>> 24) & 0xff;
  head[29] = (crc >>> 16) & 0xff;
  head[30] = (crc >>> 8) & 0xff;
  head[31] = crc & 0xff;

  return Buffer.concat([head, Buffer.from(indexed)]);
}

const INDEXED_LEN = ((FRAME_W * FRAME_H + 1) >> 1); // packed 4bpp, same as Dart

/** True if buffer looks like Flutter MYFM (.bin from app encode or VPS sidecar). */
export function isProbablyMyfmBuffer(buf: Buffer): boolean {
  return (
    buf.length === 32 + INDEXED_LEN &&
    buf[0] === 0x4d &&
    buf[1] === 0x59 &&
    buf[2] === 0x46 &&
    buf[3] === 0x4d
  );
}

/** JPEG/PNG/etc. → 1200×1600 MYFM `.bin`; written beside upload as `<stem>.bin`. */
export async function writeMyfmSidecar(uploadedAbsPath: string): Promise<string> {
  const meta = await sharp(uploadedAbsPath).metadata();
  let pipeline = sharp(uploadedAbsPath).rotate().resize(FRAME_W, FRAME_H, {
    fit: "cover",
    position: "centre",
  });
  // JPEG has no alpha — skip flatten (some sharp/libvips builds error on flatten without alpha).
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

  const stem = path.parse(uploadedAbsPath).name;
  const binPath = path.join(path.dirname(uploadedAbsPath), `${stem}.bin`);
  await fs.writeFile(binPath, out);

  return `${stem}.bin`;
}
