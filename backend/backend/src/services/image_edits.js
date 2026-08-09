"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyEdits = applyEdits;
const sharp_1 = __importDefault(require("sharp"));
const myfm_encode_1 = require("./myfm_encode");
function clamp(n, min, max) {
    return n < min ? min : n > max ? max : n;
}
function clamp255(n) {
    return n < 0 ? 0 : n > 255 ? 255 : n;
}
function escapeXml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function toUint8(buf) {
    return Uint8Array.from(buf);
}
function parseAspectString(s) {
    const m = s.match(/^(\d+)\s*:\s*(\d+)$/);
    if (m)
        return Number(m[1]) / Number(m[2]);
    const n = Number(s);
    return n > 0 ? n : 0;
}
function centerCropAspect(imgW, imgH, targetAspect) {
    const current = imgW / imgH;
    if (Math.abs(current - targetAspect) < 0.001) {
        return { left: 0, top: 0, width: imgW, height: imgH };
    }
    if (current > targetAspect) {
        const cropW = Math.round(imgH * targetAspect);
        return { left: Math.round((imgW - cropW) / 2), top: 0, width: cropW, height: imgH };
    }
    else {
        const cropH = Math.round(imgW / targetAspect);
        return { left: 0, top: Math.round((imgH - cropH) / 2), width: imgW, height: cropH };
    }
}
function zoomPanCrop(imgW, imgH, zoom, panX, panY) {
    if (zoom <= 1.001 && Math.abs(panX) < 0.001 && Math.abs(panY) < 0.001) {
        return { left: 0, top: 0, width: imgW, height: imgH };
    }
    const z = clamp(zoom, 1, 3);
    const cropW = Math.max(1, Math.round(imgW / z));
    const cropH = Math.max(1, Math.round(imgH / z));
    const maxX = imgW - cropW;
    const maxY = imgH - cropH;
    const x = Math.round((maxX / 2) + clamp(panX, -1, 1) * (maxX / 2));
    const y = Math.round((maxY / 2) + clamp(panY, -1, 1) * (maxY / 2));
    return {
        left: clamp(x, 0, maxX),
        top: clamp(y, 0, maxY),
        width: cropW,
        height: cropH,
    };
}
// ——— liftVeryDark (match Flutter's _liftVeryDark) ————
function computeAvgLuminance(raw, w, h) {
    let sum = 0;
    let samples = 0;
    for (let y = 0; y < h; y += 12) {
        for (let x = 0; x < w; x += 12) {
            const i = (y * w + x) * 3;
            sum += 0.299 * raw[i] + 0.587 * raw[i + 1] + 0.114 * raw[i + 2];
            samples++;
        }
    }
    return samples > 0 ? sum / samples : 128;
}
function liftVeryDark(raw, w, h) {
    const avg = computeAvgLuminance(raw, w, h);
    if (avg >= 42)
        return raw;
    const lift = clamp(1.0 + (42 - avg) / 70, 1.0, 1.55);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 3) {
        out[i] = clamp255(Math.round(raw[i] * lift));
        out[i + 1] = clamp255(Math.round(raw[i + 1] * lift));
        out[i + 2] = clamp255(Math.round(raw[i + 2] * lift));
    }
    return out;
}
// ——— Overlay SVG (bottom bar + border + stickers, matches Flutter's drawSendOverlayOnImage + preview border) ————
function buildOverlaySvg(overlay, locationText, borderStyle = "none") {
    const lines = [];
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (overlay.showWeather && overlay.weatherText?.trim()) {
        lines.push({ text: overlay.weatherText.trim(), color: "#FFFFFF" });
    }
    else if (overlay.showLocation && locationText.trim()) {
        lines.push({ text: locationText.trim(), color: "#DCDCDC" });
    }
    if (overlay.showDate) {
        lines.push({ text: dateStr, color: "#FFFFFF" });
    }
    if (overlay.centerText?.trim()) {
        const color = overlay.centerTextColor || "#FFFFFF";
        lines.push({ text: overlay.centerText.trim(), color });
    }
    if (overlay.showGreeting) {
        const greet = overlay.greetingCustom?.trim() || "With love from MyFrame";
        lines.push({ text: greet, color: "#FFEB82" });
    }
    if (overlay.customText?.trim()) {
        lines.push({ text: overlay.customText.trim(), color: "#87CEEB" });
    }
    if (lines.length === 0 && !overlay.centerSticker)
        return null;
    const step = 28;
    const barH = Math.max(96, 28 + lines.length * step);
    const barY = myfm_encode_1.FRAME_H - barH;
    const parts = [];
    // Border (rendered under bottom bar)
    switch (borderStyle) {
        case "thinBlack":
            parts.push(`<rect x="0" y="0" width="${myfm_encode_1.FRAME_W}" height="${myfm_encode_1.FRAME_H}" fill="none" stroke="#000" stroke-width="2"/>`);
            break;
        case "thickWhite":
            parts.push(`<rect x="0" y="0" width="${myfm_encode_1.FRAME_W}" height="${myfm_encode_1.FRAME_H}" fill="none" stroke="#FFF" stroke-width="10"/>`);
            break;
        case "polaroid":
            parts.push(`<rect x="0" y="0" width="${myfm_encode_1.FRAME_W}" height="${myfm_encode_1.FRAME_H}" fill="none" stroke="#FFF" stroke-width="10"/>`);
            parts.push(`<rect x="0" y="${myfm_encode_1.FRAME_H - 28}" width="${myfm_encode_1.FRAME_W}" height="28" fill="#FFF"/>`);
            break;
        case "film":
            parts.push(`<rect x="0" y="0" width="${myfm_encode_1.FRAME_W}" height="${myfm_encode_1.FRAME_H}" fill="none" stroke="#000" stroke-width="12"/>`);
            break;
        case "rounded":
            parts.push(`<rect x="2" y="2" width="${myfm_encode_1.FRAME_W - 4}" height="${myfm_encode_1.FRAME_H - 4}" rx="26" ry="26" fill="none" stroke="rgba(0,0,0,0.2)" stroke-width="2"/>`);
            break;
        case "double":
            parts.push(`<rect x="0" y="0" width="${myfm_encode_1.FRAME_W}" height="${myfm_encode_1.FRAME_H}" fill="none" stroke="rgba(0,0,0,0.87)" stroke-width="4"/>`);
            parts.push(`<rect x="8" y="8" width="${myfm_encode_1.FRAME_W - 16}" height="${myfm_encode_1.FRAME_H - 16}" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="2"/>`);
            break;
    }
    parts.push(`<rect x="0" y="${barY}" width="${myfm_encode_1.FRAME_W}" height="${barH}" fill="rgba(0,0,0,0.47)"/>`);
    let textY = barY + 38;
    for (const line of lines) {
        parts.push(`<text x="${myfm_encode_1.FRAME_W / 2}" y="${textY}" font-family="sans-serif" font-size="24px" fill="${line.color}" text-anchor="middle">${escapeXml(line.text)}</text>`);
        textY += step;
    }
    if (overlay.centerSticker) {
        const sticker = overlay.centerSticker.trim();
        const sx = Math.round((overlay.stickerAlignX ?? 0.62) * myfm_encode_1.FRAME_W);
        const sy = Math.round((overlay.stickerAlignY ?? 0.4) * myfm_encode_1.FRAME_H);
        const size = Math.max(14, Math.round((myfm_encode_1.FRAME_W / 20) * (overlay.stickerSize ?? 28) / 28));
        const r = size;
        const halfR = Math.round(r / 2);
        const thirdR = Math.round(r / 3);
        const quarterR = Math.round(r / 4);
        // Colors matching Flutter
        const red = "#E5292A";
        const yellow = "#FFDC00";
        const blue = "#1E5AFF";
        const green = "#14B446";
        const black = "#141414";
        switch (sticker) {
            case "♥":
                parts.push(`<circle cx="${sx - halfR}" cy="${sy - Math.round(r / 5)}" r="${Math.round(r * 0.55)}" fill="${red}"/>`, `<circle cx="${sx + halfR}" cy="${sy - Math.round(r / 5)}" r="${Math.round(r * 0.55)}" fill="${red}"/>`);
                for (let i = 0; i < r; i++) {
                    const half = r - i;
                    parts.push(`<line x1="${sx - half}" y1="${sy + Math.round(i / 2)}" x2="${sx + half}" y2="${sy + Math.round(i / 2)}" stroke="${red}" stroke-width="2"/>`);
                }
                break;
            case "★":
            case "☀":
                parts.push(`<circle cx="${sx}" cy="${sy}" r="${r}" fill="${yellow}"/>`, `<circle cx="${sx}" cy="${sy}" r="${r}" fill="none" stroke="${black}" stroke-width="2"/>`);
                break;
            case "●":
                parts.push(`<circle cx="${sx}" cy="${sy}" r="${r}" fill="${blue}"/>`);
                break;
            case "▲":
                parts.push(`<polygon points="${sx - r},${sy + r} ${sx + r},${sy + r} ${sx},${sy - r}" fill="${green}"/>`);
                break;
            case "✚":
                parts.push(`<rect x="${sx - quarterR}" y="${sy - r}" width="${halfR}" height="${r * 2}" fill="${red}"/>`, `<rect x="${sx - r}" y="${sy - quarterR}" width="${r * 2}" height="${halfR}" fill="${red}"/>`);
                break;
            case "→":
                parts.push(`<line x1="${sx - r}" y1="${sy}" x2="${sx + r}" y2="${sy}" stroke="${black}" stroke-width="6"/>`, `<polygon points="${sx + thirdR},${sy - halfR} ${sx + r},${sy} ${sx + thirdR},${sy + halfR}" fill="${black}"/>`);
                break;
            case "◖":
                parts.push(`<circle cx="${sx}" cy="${sy}" r="${r}" fill="${black}"/>`, `<circle cx="${sx}" cy="${sy}" r="${Math.round(r * 0.7)}" fill="#FFFFFF"/>`);
                break;
            default:
                parts.push(`<circle cx="${sx}" cy="${sy}" r="${r}" fill="${red}"/>`);
        }
    }
    return `<svg width="${myfm_encode_1.FRAME_W}" height="${myfm_encode_1.FRAME_H}" xmlns="http://www.w3.org/2000/svg"><style>text{font-family:sans-serif}</style>${parts.join("")}</svg>`;
}
// ——— Filters (match Flutter's _applyNamedFilter) ————
function applyFilter(pipeline, filter) {
    switch (filter) {
        case "grayscale":
            return pipeline.grayscale();
        case "sepia":
            return pipeline.recomb([
                [0.393, 0.769, 0.189],
                [0.349, 0.686, 0.168],
                [0.272, 0.534, 0.131],
            ]);
        case "warm":
            return pipeline
                .recomb([
                [0.393, 0.769, 0.189],
                [0.349, 0.686, 0.168],
                [0.272, 0.534, 0.131],
            ]);
        case "cool":
            return pipeline.recomb([
                [0.8, 0.0, 0.0],
                [0.0, 1.0, 0.0],
                [0.0, 0.1, 1.2],
            ]);
        case "contrast":
            return pipeline.linear(1.35, -44.8);
        case "vivid":
            return pipeline.linear(1.12, -15.36).recomb([
                [1.0, 0.0, 0.0],
                [0.0, 1.0, 0.0],
                [0.0, 0.0, 1.0],
            ]);
        case "vintage":
            return pipeline
                .recomb([
                [0.393, 0.769, 0.189],
                [0.349, 0.686, 0.168],
                [0.272, 0.534, 0.131],
            ])
                .linear(0.92, -20.48);
        default:
            return pipeline;
    }
}
// ——— Unsharp sharpen (match Flutter's _unsharpSharpen) ————
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
function assertRaw3ch(raw, label) {
    const exp = myfm_encode_1.FRAME_W * myfm_encode_1.FRAME_H * 3;
    if (raw.length !== exp) {
        throw new Error(`[edits] ${label}: raw size mismatch — expected ${exp} (3ch), got ${raw.length} (${raw.length === myfm_encode_1.FRAME_W * myfm_encode_1.FRAME_H ? '1ch' : '?'})`);
    }
}
// ——— Main pipeline ———————
async function applyEdits(inputBuffer, edits) {
    if (!edits) {
        const { data, info } = await (0, sharp_1.default)(inputBuffer)
            .rotate()
            .resize(myfm_encode_1.FRAME_W, myfm_encode_1.FRAME_H, { fit: "cover", position: "centre" })
            .raw()
            .toBuffer({ resolveWithObject: true });
        return (0, myfm_encode_1.encodeMyfmFromRgb)(toUint8(data), info.channels ?? 3, info.width, info.height);
    }
    const { quarterTurns = 0, flipH = false, flipV = false, brightness: userBrightness = 1.0, contrast: userContrast = 1.0, saturation: userSaturation = 1.0, filter = "none", cropAspect = 0, cropZoom = 1.0, cropPanX = 0, cropPanY = 0, } = edits;
    const ch = 3;
    // --- 1. Compute post-rotation dimensions ---
    const meta = await (0, sharp_1.default)(inputBuffer).metadata();
    const preW = meta.width ?? 0;
    const preH = meta.height ?? 0;
    const orientation = meta.orientation ?? 1;
    const exifSwaps = orientation === 5 || orientation === 6 || orientation === 7 || orientation === 8;
    const qtSwaps = (quarterTurns % 2) === 1;
    const doSwap = exifSwaps !== qtSwaps;
    const imgW = doSwap ? preH : preW;
    const imgH = doSwap ? preW : preH;
    // --- 2. Compute crop (safe bounds) ---
    const frameAspect = myfm_encode_1.FRAME_W / myfm_encode_1.FRAME_H;
    const parsedAspect = typeof cropAspect === "string" ? parseAspectString(cropAspect) : cropAspect;
    const targetAspect = parsedAspect > 0 ? parsedAspect : frameAspect;
    const safeW = Math.max(1, imgW);
    const safeH = Math.max(1, imgH);
    const aspectCrop = centerCropAspect(safeW, safeH, targetAspect);
    const zpCrop = zoomPanCrop(aspectCrop.width, aspectCrop.height, cropZoom, cropPanX, cropPanY);
    const cropLeft = Math.max(0, Math.min(aspectCrop.left + zpCrop.left, safeW - 1));
    const cropTop = Math.max(0, Math.min(aspectCrop.top + zpCrop.top, safeH - 1));
    const cropW = Math.max(1, Math.min(zpCrop.width, safeW - cropLeft));
    const cropH = Math.max(1, Math.min(zpCrop.height, safeH - cropTop));
    // --- 3. Rotate / flip + extract + resize to 1200x1600 ---
    let pipeline = (0, sharp_1.default)(inputBuffer).rotate();
    if (flipH)
        pipeline = pipeline.flop();
    if (flipV)
        pipeline = pipeline.flip();
    const rotation = (quarterTurns * 90) % 360;
    if (rotation !== 0)
        pipeline = pipeline.rotate(rotation);
    let raw = toUint8(await pipeline
        .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
        .resize(myfm_encode_1.FRAME_W, myfm_encode_1.FRAME_H, { fit: "fill" })
        .raw()
        .toBuffer());
    // --- 4. Lift very dark ---
    raw = liftVeryDark(raw, myfm_encode_1.FRAME_W, myfm_encode_1.FRAME_H);
    // --- 5. User color grade ---
    assertRaw3ch(raw, "beforeColorGrade");
    let adjPipeline = (0, sharp_1.default)(raw, { raw: { width: myfm_encode_1.FRAME_W, height: myfm_encode_1.FRAME_H, channels: ch } });
    if (userBrightness !== 1.0)
        adjPipeline = adjPipeline.linear(clamp(userBrightness, 0, 3), 255 * (1 - clamp(userBrightness, 0, 3)) / 2);
    if (userContrast !== 1.0)
        adjPipeline = adjPipeline.linear(clamp(userContrast, 0, 3), 128 * (1 - clamp(userContrast, 0, 3)));
    if (userSaturation !== 1.0) {
        const s = clamp(userSaturation, 0, 3);
        const sr = (1 - s) * 0.299;
        const sg = (1 - s) * 0.587;
        const sb = (1 - s) * 0.114;
        adjPipeline = adjPipeline.recomb([
            [sr + s, sg, sb],
            [sr, sg + s, sb],
            [sr, sg, sb + s],
        ]);
    }
    if (filter !== "none")
        adjPipeline = applyFilter(adjPipeline, filter);
    const rawAfterColor = toUint8(await adjPipeline.raw().toBuffer());
    if (rawAfterColor.length === myfm_encode_1.FRAME_W * myfm_encode_1.FRAME_H) {
        const rgb = new Uint8Array(myfm_encode_1.FRAME_W * myfm_encode_1.FRAME_H * 3);
        for (let i = 0; i < rawAfterColor.length; i++) {
            const v = rawAfterColor[i];
            rgb[i * 3] = v;
            rgb[i * 3 + 1] = v;
            rgb[i * 3 + 2] = v;
        }
        raw = rgb;
    }
    else {
        raw = rawAfterColor;
    }
    // --- 6. Composite overlay SVG ---
    const hasOverlay = edits.overlay && (edits.overlay.showDate || edits.overlay.showLocation || edits.overlay.showGreeting ||
        edits.overlay.showWeather || edits.overlay.centerText || edits.overlay.centerSticker ||
        edits.overlay.customText);
    if (hasOverlay) {
        const svg = buildOverlaySvg(edits.overlay, edits.locationText || "", edits.borderStyle || "none");
        if (svg) {
            assertRaw3ch(raw, "beforeOverlay");
            raw = toUint8(await (0, sharp_1.default)(raw, { raw: { width: myfm_encode_1.FRAME_W, height: myfm_encode_1.FRAME_H, channels: ch } })
                .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
                .removeAlpha()
                .raw()
                .toBuffer());
        }
    }
    // --- 7. XT-specific pre-processing ---
    assertRaw3ch(raw, "beforeXtBright");
    raw = toUint8(await (0, sharp_1.default)(raw, { raw: { width: myfm_encode_1.FRAME_W, height: myfm_encode_1.FRAME_H, channels: ch } })
        .linear(1.04, 255 * (1 - 1.04) / 2)
        .raw()
        .toBuffer());
    const xts = 1.58;
    const xtsr = (1 - xts) * 0.299;
    const xtsg = (1 - xts) * 0.587;
    const xtsb = (1 - xts) * 0.114;
    assertRaw3ch(raw, "beforeXtSat");
    raw = toUint8(await (0, sharp_1.default)(raw, { raw: { width: myfm_encode_1.FRAME_W, height: myfm_encode_1.FRAME_H, channels: ch } })
        .recomb([
        [xtsr + xts, xtsg, xtsb],
        [xtsr, xtsg + xts, xtsb],
        [xtsr, xtsg, xtsb + xts],
    ])
        .raw()
        .toBuffer());
    assertRaw3ch(raw, "beforeXtContrast");
    raw = toUint8(await (0, sharp_1.default)(raw, { raw: { width: myfm_encode_1.FRAME_W, height: myfm_encode_1.FRAME_H, channels: ch } })
        .linear(1.28, 128 * (1 - 1.28))
        .raw()
        .toBuffer());
    return (0, myfm_encode_1.encodeMyfmFromRgb)(raw, ch, myfm_encode_1.FRAME_W, myfm_encode_1.FRAME_H);
}
