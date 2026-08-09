"use strict";
/**
 * XT ePaper 13.3″ E6 `.bin` — **only** format this module writes (hardware-verified).
 *
 * - **960004 bytes**: `>HH` header (1200, 1600) + **960000** packed pixels. No MYFM magic, no CRC32.
 * - Pixel order: **left half** (columns 0–599, all rows top→bottom) then **right half** (600–1199).
 * - 4 bpp, 2 nibbles/byte, **high = first** pixel along each half stream.
 * - Palette indices: 0 black, 1 white, 2 yellow, 3 red, **5** blue, **6** green (4 unused).
 * - **Floyd–Steinberg** dithering after contrast/sharpen preprocessing (Sharp pipeline).
 * - **Client `.bin` uploads (iOS / Flutter) must never be re-encoded** — store bytes as-is.
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
exports.storeClientXtBin = storeClientXtBin;
exports.looksLikeRasterBuffer = looksLikeRasterBuffer;
exports.normalizeUploadToSrgbJpeg = normalizeUploadToSrgbJpeg;
exports.writeMyfmSidecar = writeMyfmSidecar;
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
/** Match Flutter `ImageProcessorService` XT pre-quantize (myframeapp). */
const XT_CONTRAST = 1.28;
const XT_SATURATION = 1.58;
const XT_BRIGHTNESS = 1.04;
const XT_SHARPNESS = 1.45;
function clamp255(n) {
    return n < 0 ? 0 : n > 255 ? 255 : n;
}
function nearestXtPaletteIndex(r, g, b) {
    let bestIdx = 0;
    let bestD = Number.POSITIVE_INFINITY;
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
function paletteRgbForIndex(idx) {
    switch (idx) {
        case 0:
            return [0, 0, 0];
        case 1:
            return [255, 255, 255];
        case 2:
            return [255, 255, 0];
        case 3:
            return [255, 0, 0];
        case 5:
            return [0, 0, 255];
        case 6:
            return [0, 255, 0];
        default:
            return [0, 0, 0];
    }
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
/**
 * Store a client-encoded XT `.bin` verbatim (iOS / Flutter TestFlight path).
 * Never run Sharp or second-pass dither on these bytes.
 */
async function storeClientXtBin(buf, uploadDir, basename) {
    assertXt13e6Bin(buf);
    const safe = path_1.default.basename(basename).replace(/[^a-zA-Z0-9._-]/g, "_") || "upload.bin";
    const outName = safe.toLowerCase().endsWith(".bin") ? safe : `${safe}.bin`;
    const outPath = path_1.default.join(uploadDir, outName);
    await promises_1.default.writeFile(outPath, buf);
    return outName;
}
/** Detect common raster containers by magic bytes (ignore misleading extensions). */
function looksLikeRasterBuffer(buf, extHint = "") {
    if (!buf || buf.length < 12)
        return false;
    const ext = extHint.toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".heic", ".heif", ".gif", ".avif"].includes(ext)) {
        return true;
    }
    // JPEG
    if (buf[0] === 0xff && buf[1] === 0xd8)
        return true;
    // PNG
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
        return true;
    // GIF
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46)
        return true;
    // WEBP: RIFF....WEBP
    if (buf[0] === 0x52 &&
        buf[1] === 0x49 &&
        buf[2] === 0x46 &&
        buf[3] === 0x46 &&
        buf[8] === 0x57 &&
        buf[9] === 0x45 &&
        buf[10] === 0x42 &&
        buf[11] === 0x50) {
        return true;
    }
    // TIFF
    if ((buf[0] === 0x49 && buf[1] === 0x49 && buf[2] === 0x2a && buf[3] === 0x00) ||
        (buf[0] === 0x4d && buf[1] === 0x4d && buf[2] === 0x00 && buf[3] === 0x2a)) {
        return true;
    }
    // HEIC / HEIF / AVIF (ISO BMFF ftyp)
    if (buf.length >= 12 && buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
        const brand = buf.subarray(8, 12).toString("ascii");
        if (["heic", "heix", "hevc", "hevx", "mif1", "msf1", "avif", "avis"].includes(brand)) {
            return true;
        }
    }
    return false;
}
async function decodeHeicToJpeg(buf) {
    // Apple HEIC is often missing from sharp's bundled libheif codecs — use heic-convert.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const convert = require("heic-convert");
    const out = await convert({ buffer: buf, format: "JPEG", quality: 0.92 });
    return Buffer.from(out);
}
/**
 * Normalize ANY upload (HEIC / P3 PNG / WebP / TIFF / JPEG) to sRGB JPEG bytes.
 * Empty uploads fail fast with a clear error (common iOS Limited Photos / iCloud stub).
 */
async function normalizeUploadToSrgbJpeg(input) {
    const buf = typeof input === "string" ? await promises_1.default.readFile(input) : input;
    if (!buf.length) {
        throw new Error("empty_image_upload: received 0 bytes (iCloud/Limited Photos stub or failed client read)");
    }
    const trySharp = async (source) => {
        return (0, sharp_1.default)(source, { failOn: "none", unlimited: true })
            .rotate()
            .toColorspace("srgb")
            .flatten({ background: { r: 255, g: 255, b: 255 } })
            .jpeg({ quality: 92, mozjpeg: true })
            .toBuffer();
    };
    try {
        return await trySharp(buf);
    }
    catch (primary) {
        const msg = primary instanceof Error ? primary.message : String(primary);
        try {
            const jpegFromHeic = await decodeHeicToJpeg(buf);
            return await trySharp(jpegFromHeic);
        }
        catch (heicErr) {
            const heicMsg = heicErr instanceof Error ? heicErr.message : String(heicErr);
            throw new Error(`unsupported_image_format: sharp=${msg}; heic-convert=${heicMsg}`);
        }
    }
}
/** Raster → XT `.bin` sidecar next to upload (`<stem>.bin`) — only when client did not send `.bin`. */
async function writeMyfmSidecar(uploadedAbsPath) {
    // Always decode → sRGB JPEG first so Display P3 / HEIC / WebP never hit the dither path raw.
    const jpegBuf = await normalizeUploadToSrgbJpeg(uploadedAbsPath);
    const stem = path_1.default.parse(uploadedAbsPath).name;
    const dir = path_1.default.dirname(uploadedAbsPath);
    const normJpegPath = path_1.default.join(dir, `${stem}.norm.jpg`);
    await promises_1.default.writeFile(normJpegPath, jpegBuf);
    const meta = await (0, sharp_1.default)(jpegBuf).metadata();
    const b = 128 * (1 - XT_CONTRAST);
    let pipeline = (0, sharp_1.default)(jpegBuf).rotate().resize(exports.FRAME_W, exports.FRAME_H, {
        fit: "cover",
        position: "centre",
        kernel: sharp_1.default.kernel.cubic,
    });
    if (meta.hasAlpha) {
        pipeline = pipeline.ensureAlpha().flatten({ background: { r: 255, g: 255, b: 255 } });
    }
    pipeline = pipeline
        .modulate({ brightness: XT_BRIGHTNESS, saturation: XT_SATURATION })
        .linear(XT_CONTRAST, b)
        .sharpen({ sigma: 1, m1: XT_SHARPNESS, m2: XT_SHARPNESS });
    const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels ?? 0;
    if (ch < 3) {
        throw new Error(`need at least 3 channels after processing, got ${ch}`);
    }
    const stride = ch;
    const out = encodeMyfmFromRgb(new Uint8Array(data), stride, info.width, info.height);
    const binPath = path_1.default.join(dir, `${stem}.bin`);
    await promises_1.default.writeFile(binPath, out);
    return `${stem}.bin`;
}
