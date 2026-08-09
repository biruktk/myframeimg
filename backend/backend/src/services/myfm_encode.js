"use strict";
/**
 * XT ePaper 13.3″ E6 `.bin` — **only** format this module writes (hardware-verified).
 *
 * - **960004 bytes**: `>HH` header (1200, 1600) + **960000** packed pixels. No MYFM magic, no CRC32.
 * - Pixel order: **left half** (columns 0–599, all rows top→bottom) then **right half** (600–1199).
 * - 4 bpp, 2 nibbles/byte, **high = first** pixel along each half stream.
 * - Palette indices: 0 black, 1 white, 2 yellow, 3 red, **5** blue, **6** green (4 unused).
 * - **Floyd–Steinberg** dithering after contrast/sharpen preprocessing (Sharp pipeline).
 *
 * If you still see **960032** bytes or `4D59464D` (“MYFM”) on disk, the server is running an **old
 * `dist/` build** — run `npm run build` and restart PM2.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.XT_BIN_TOTAL_BYTES = exports.XT_BIN_PAYLOAD_BYTES = exports.FRAME_H = exports.FRAME_W = void 0;
exports.encodeMyfmFromRgb = encodeMyfmFromRgb;
exports.assertXt13e6Bin = assertXt13e6Bin;
exports.isProbablyMyfmBuffer = isProbablyMyfmBuffer;
exports.writeMyfmSidecar = writeMyfmSidecar;
exports.writeMyfmFromBuffer = writeMyfmFromBuffer;
const fs_1 = __importDefault(require("fs"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const sharp_1 = __importDefault(require("sharp"));
exports.FRAME_W = 1200;
exports.FRAME_H = 1600;
const HALF_W = exports.FRAME_W >>> 1;
const NIBBLES_PER_HALF = HALF_W * exports.FRAME_H;
const PACKED_HALF_LEN = NIBBLES_PER_HALF >>> 1;
exports.XT_BIN_PAYLOAD_BYTES = PACKED_HALF_LEN * 2;
exports.XT_BIN_TOTAL_BYTES = 4 + exports.XT_BIN_PAYLOAD_BYTES;
const LEGACY_MYFM_MAGIC_SIZE = 32 + ((exports.FRAME_W * exports.FRAME_H + 1) >> 1);
/** [hardware index, R, G, B] — hardware index 4 is invalid / unused. */
const XT_PALETTE = [
    [0, 0, 0, 0],
    [1, 255, 255, 255],
    [2, 255, 255, 0],
    [3, 255, 0, 0],
    [5, 0, 0, 255],
    [6, 0, 255, 0],
];
const FS7 = 7 / 16;
const FS3 = 3 / 16;
const FS5 = 5 / 16;
const FS1 = 1 / 16;
function clamp255(n) {
    return n < 0 ? 0 : n > 255 ? 255 : n;
}
const PALETTE_RGB = {
    0: [0, 0, 0],
    1: [255, 255, 255],
    2: [255, 255, 0],
    3: [255, 0, 0],
    5: [0, 0, 255],
    6: [0, 255, 0],
};
function nearestXtPaletteIndex(r, g, b) {
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const chroma = maxC - minC;
    if (r > 175 && g < 110 && b < 110 && r > g + 40 && r > b + 40)
        return 3;
    if (b > 175 && r < 110 && g < 140 && b > r + 40)
        return 5;
    if (g > 175 && r < 130 && b < 130 && g > r + 30)
        return 6;
    if (r > 200 && g > 200 && b < 140)
        return 2;
    const search = chroma < 18 ? (lum < 132 ? [0, 1] : [1, 0])
        : r >= g && r >= b && r - Math.min(g, b) > 16 ? [3, 2, 0, 1, 5, 6]
            : g >= r && g >= b && g - Math.min(r, b) > 16 ? [6, 2, 0, 1, 3, 5]
                : b >= r && b >= g && b - Math.min(r, g) > 16 ? [5, 0, 1, 3, 6, 2]
                    : r > 150 && g > 150 && b < 130 ? [2, 1, 3, 0]
                        : [0, 1, 2, 3, 5, 6];
    let bestIdx = 0;
    let bestD = Number.POSITIVE_INFINITY;
    for (const idx of search) {
        const c = PALETTE_RGB[idx];
        if (!c)
            continue;
        const dr = r - c[0];
        const dg = g - c[1];
        const db = b - c[2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) {
            bestD = d;
            bestIdx = idx;
        }
    }
    return bestIdx;
}
function paletteRgbForIndex(idx) {
    return PALETTE_RGB[idx] ?? [0, 0, 0];
}
/**
 * Row-major RGB8 → packed left/right halves + 4-byte BE header. Applies Floyd–Steinberg on float RGB.
 */
function encodeMyfmFromRgb(raw, stride, width, height) {
    if (width !== exports.FRAME_W || height !== exports.FRAME_H) {
        throw new Error(`XT .bin raster must be ${exports.FRAME_W}×${exports.FRAME_H}, got ${width}×${height}`);
    }
    const px = width * height;
    const wr = new Float32Array(px);
    const wg = new Float32Array(px);
    const wb = new Float32Array(px);
    for (let i = 0; i < px; i++) {
        const o = i * stride;
        wr[i] = raw[o];
        wg[i] = raw[o + 1];
        wb[i] = raw[o + 2];
    }
    const quantized = new Uint8Array(px);
    const diffuse = (nx, ny, er, eg, eb, f) => {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height)
            return;
        const j = ny * width + nx;
        wr[j] += er * f;
        wg[j] += eg * f;
        wb[j] += eb * f;
    };
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            const oldR = clamp255(wr[i]);
            const oldG = clamp255(wg[i]);
            const oldB = clamp255(wb[i]);
            const idx = nearestXtPaletteIndex(oldR, oldG, oldB);
            const [nr, ng, nb] = paletteRgbForIndex(idx);
            quantized[i] = idx & 0xff;
            wr[i] = nr;
            wg[i] = ng;
            wb[i] = nb;
            const er = oldR - nr;
            const eg = oldG - ng;
            const eb = oldB - nb;
            diffuse(x + 1, y, er, eg, eb, FS7);
            diffuse(x - 1, y + 1, er, eg, eb, FS3);
            diffuse(x, y + 1, er, eg, eb, FS5);
            diffuse(x + 1, y + 1, er, eg, eb, FS1);
        }
    }
    const left = new Uint8Array(NIBBLES_PER_HALF);
    const right = new Uint8Array(NIBBLES_PER_HALF);
    let li = 0;
    let ri = 0;
    for (let yy = 0; yy < height; yy++) {
        for (let xx = 0; xx < HALF_W; xx++) {
            left[li++] = quantized[yy * width + xx];
        }
        for (let xx = HALF_W; xx < width; xx++) {
            right[ri++] = quantized[yy * width + xx];
        }
    }
    const header = Buffer.alloc(4);
    header.writeUInt16BE(exports.FRAME_W, 0);
    header.writeUInt16BE(exports.FRAME_H, 2);
    function packNibblePairs(indices) {
        const out = new Uint8Array(PACKED_HALF_LEN);
        for (let i = 0, o = 0; i < NIBBLES_PER_HALF; i += 2, o++) {
            const hi = indices[i] & 0xf;
            const lo = indices[i + 1] & 0xf;
            out[o] = (hi << 4) | lo;
        }
        return out;
    }
    const leftPacked = packNibblePairs(left);
    const rightPacked = packNibblePairs(right);
    const out = Buffer.allocUnsafe(exports.XT_BIN_TOTAL_BYTES);
    header.copy(out, 0, 0, 4);
    Buffer.from(leftPacked).copy(out, 4, 0, PACKED_HALF_LEN);
    Buffer.from(rightPacked).copy(out, 4 + PACKED_HALF_LEN, 0, PACKED_HALF_LEN);
    assertXt13e6Bin(out);
    return out;
}
/** Throw if buffer is not exactly the hardware `.bin` layout (header bytes + length). */
function assertXt13e6Bin(buf) {
    if (buf.length !== exports.XT_BIN_TOTAL_BYTES) {
        throw new Error(`XT .bin must be exactly ${exports.XT_BIN_TOTAL_BYTES} bytes (got ${buf.length}). Old MYFM was ${LEGACY_MYFM_MAGIC_SIZE} — rebuild API.`);
    }
    if (buf[0] !== 0x04 || buf[1] !== 0xb0 || buf[2] !== 0x06 || buf[3] !== 0x40) {
        throw new Error(`XT .bin header corrupt: expected 04 B0 06 40, got ${buf.subarray(0, 4).toString("hex").toUpperCase()} — remove MYFM/CRC headers.`);
    }
}
/**
 * True only for **official** 13.3E6 `.bin` (960004 B, correct `>HH` header). Rejects legacy MYFM.
 */
function isProbablyMyfmBuffer(buf) {
    if (buf.length === LEGACY_MYFM_MAGIC_SIZE && buf[0] === 0x4d && buf[1] === 0x59 && buf[2] === 0x46 && buf[3] === 0x4d) {
        return false;
    }
    if (buf.length !== exports.XT_BIN_TOTAL_BYTES)
        return false;
    return buf[0] === 0x04 && buf[1] === 0xb0 && buf[2] === 0x06 && buf[3] === 0x40;
}
/** Raster → XT `.bin` sidecar next to upload (`<stem>.bin`). */
async function writeMyfmSidecar(uploadedAbsPath) {
    const buf = fs_1.default.readFileSync(uploadedAbsPath);
    return writeMyfmFromBuffer(buf, path_1.default.dirname(uploadedAbsPath), path_1.default.basename(uploadedAbsPath, path_1.default.extname(uploadedAbsPath)));
}
async function writeMyfmFromBuffer(imageBuffer, outputDir, stem) {
    const ch = 3;
    // 1. Decode, flatten, rotate, resize to frame
    const { data: rawResized } = await (0, sharp_1.default)(imageBuffer)
        .ensureAlpha()
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .rotate()
        .resize(exports.FRAME_W, exports.FRAME_H, { fit: "cover", position: "centre" })
        .raw()
        .toBuffer({ resolveWithObject: true });
    // 2. XT brightness 1.04
    let raw = await (0, sharp_1.default)(rawResized, { raw: { width: exports.FRAME_W, height: exports.FRAME_H, channels: ch } })
        .linear(1.04, 255 * (1 - 1.04) / 2)
        .raw()
        .toBuffer();
    // 3. XT saturation 1.58
    const xts = 1.58;
    const xtsr = (1 - xts) * 0.299;
    const xtsg = (1 - xts) * 0.587;
    const xtsb = (1 - xts) * 0.114;
    raw = await (0, sharp_1.default)(raw, { raw: { width: exports.FRAME_W, height: exports.FRAME_H, channels: ch } })
        .recomb([
        [xtsr + xts, xtsg, xtsb],
        [xtsr, xtsg + xts, xtsb],
        [xtsr, xtsg, xtsb + xts],
    ])
        .raw()
        .toBuffer();
    // 4. XT contrast 1.28
    raw = await (0, sharp_1.default)(raw, { raw: { width: exports.FRAME_W, height: exports.FRAME_H, channels: ch } })
        .linear(1.28, 128 * (1 - 1.28))
        .raw()
        .toBuffer();
    // 5. Unsharp sharpen 1.45
    raw = unsharpSharpen(raw, exports.FRAME_W, exports.FRAME_H, 1.45);
    // 6. Floyd-Steinberg + .bin
    const out = encodeMyfmFromRgb(raw, ch, exports.FRAME_W, exports.FRAME_H);
    const binPath = path_1.default.join(outputDir, `${stem}.bin`);
    await promises_1.default.writeFile(binPath, out);
    return path_1.default.basename(binPath).trim();
}
function unsharpSharpen(raw, w, h, factor) {
    if (Math.abs(factor - 1.0) < 1e-6)
        return raw;
    const amount = factor - 1.0;
    const out = new Uint8Array(raw.length);
    const blurred = new Float64Array(raw.length);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 3;
            let rr = 0, gg = 0, bb = 0, count = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                        const ni = (ny * w + nx) * 3;
                        rr += raw[ni];
                        gg += raw[ni + 1];
                        bb += raw[ni + 2];
                        count++;
                    }
                }
            }
            blurred[i] = rr / count;
            blurred[i + 1] = gg / count;
            blurred[i + 2] = bb / count;
        }
    }
    for (let i = 0; i < raw.length; i += 3) {
        out[i] = clamp255(Math.round(raw[i] + (raw[i] - blurred[i]) * amount));
        out[i + 1] = clamp255(Math.round(raw[i + 1] + (raw[i + 1] - blurred[i + 1]) * amount));
        out[i + 2] = clamp255(Math.round(raw[i + 2] + (raw[i + 2] - blurred[i + 2]) * amount));
    }
    return out;
}
