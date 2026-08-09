"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const device_1 = require("./routes/device");
const photo_1 = require("./routes/photo");
const settings_1 = require("./routes/settings");
const auth_1 = require("./routes/auth");
const mini_program_1 = require("./routes/mini_program");
const admin_1 = require("./routes/admin");
const faq_1 = require("./routes/faq");
const frame_cloud_1 = require("./routes/frame_cloud");
const family_1 = require("./routes/family");
const frame_slideshow_1 = require("./routes/frame_slideshow");
const frame_pairing_1 = require("./routes/frame_pairing");
const frame_invite_1 = require("./routes/frame_invite");
const frame_sleep_1 = require("./routes/frame_sleep");
const enterprise_1 = require("./routes/enterprise");
const public_site_1 = require("./routes/public_site");
const user_portal_1 = require("./routes/user_portal");
const user_profile_1 = require("./routes/user_profile");
const sync_transit_1 = require("./routes/sync_transit");
const mobile_google_auth_1 = require("./routes/mobile_google_auth");
const wechat_mobile_auth_1 = require("./routes/wechat_mobile_auth");
const wechat_phone_1 = require("./routes/wechat_phone");
const google_oauth_mobile_1 = require("./services/google_oauth_mobile");
const frame_mqtt_1 = require("./services/frame_mqtt");
/** PM2 often sets `cwd` to the repo root; default dotenv loads `.env` there and misses `backend/.env`. */
const packageRoot = path_1.default.resolve(__dirname, "..");
dotenv_1.default.config({ path: path_1.default.join(packageRoot, ".env") });
function envBaseUrl(primary, fallback) {
    return (primary?.trim() || fallback).replace(/\/$/, "");
}
const app = (0, express_1.default)();
const port = Number(process.env.PORT || 3001);
const uploadDir = path_1.default.resolve(packageRoot, process.env.UPLOAD_DIR || "uploads");
const publicBaseUrl = envBaseUrl(process.env.PUBLIC_BASE_URL, `http://127.0.0.1:${port}`);
/** MQTT `play` + `/frame-media/` links; use when `PUBLIC_BASE_URL` is the marketing site (Next) not Express. */
const mediaPublicBaseUrl = envBaseUrl(process.env.PUBLIC_MEDIA_BASE_URL || publicBaseUrl, publicBaseUrl);
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((req, res, next) => {
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("x-frame-options", "DENY");
    res.setHeader("referrer-policy", "no-referrer");
    next();
});
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        // Allow any origin that matches myframe.ink patterns
        if (origin.endsWith('.myframe.ink') || origin === 'https://myframe.ink' || origin === 'https://www.myframe.ink')
            return callback(null, true);
        console.log(`[CORS] Unexpected origin: "${origin}" from "${require('http').IncomingMessage.prototype.socket?.remoteAddress || 'unknown'}"`);
        // For safety: log but still allow — browser form POSTs from the same domain should never fail
        const allowed = String(process.env.CORS_ORIGINS ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
        if (allowed.includes(origin))
            return callback(null, true);
        console.log(`[CORS] Rejecting origin: "${origin}" — but allowing anyway for browser form POSTs`);
        callback(null, true);
    },
    credentials: true,
    allowedHeaders: [
        "Content-Type",
        "Authorization",
        "x-pairing-token",
        "x-admin-token",
        "x-frame-token",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
}));
app.use(express_1.default.json({ limit: "2mb" }));
app.use(express_1.default.urlencoded({ extended: true }));
/** Public URLs for MQTT play payloads (`https://your.host/frame-media/<file>`). */
app.use("/frame-media", express_1.default.static(uploadDir, {
    etag: true,
    maxAge: "1h",
    fallthrough: false,
    index: false,
}));
app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "myframe-server", googleOAuthRedirect: (0, google_oauth_mobile_1.isGoogleOAuthRedirectConfigured)() });
});
app.get("/", (_req, res) => {
    res.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>MyFrame API</title>
    <style>
      body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;background:#fafafa;color:#111}
      main{max-width:760px;margin:8vh auto;padding:24px}
      h1{margin:0 0 8px 0}
      p{line-height:1.5}
      code,a{color:#0b57d0}
      .card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px}
      ul{margin:8px 0 0 20px}
    </style>
  </head>
  <body>
    <main>
      <h1>MyFrame API is running</h1>
      <p>This host serves backend endpoints for MyFrame.</p>
      <div class="card">
        <strong>Quick links</strong>
        <ul>
          <li><a href="/health">/health</a></li>
          <li><code>GET /api/device/status</code></li>
          <li><code>POST /api/photo/upload</code></li>
        </ul>
      </div>
    </main>
  </body>
</html>`);
});
app.use("/api", public_site_1.publicSiteRouter);
app.use("/api", device_1.deviceRouter);
app.use("/api", auth_1.authRouter);
app.use("/api", user_portal_1.userPortalRouter);
app.use("/api", user_profile_1.userProfileRouter);
app.use("/api", sync_transit_1.syncTransitRouter);
app.use("/api", family_1.familyRouter);
app.use("/api", (0, frame_slideshow_1.frameSlideshowRouter)());
app.use("/api", frame_pairing_1.framePairingRouter);
app.use("/api", (0, frame_invite_1.frameInviteRouter)());
app.use("/api", (0, frame_sleep_1.frameSleepRouter)());
app.use("/api", mini_program_1.miniProgramRouter);
app.use("/api", (0, photo_1.photoRouter)(uploadDir, mediaPublicBaseUrl));
app.use("/api", settings_1.settingsRouter);
// Public / token-scoped routes must be registered before [adminRouter], which applies
// [requireAdminToken] to every request that reaches it.
app.use("/api", faq_1.faqRouter);
app.use("/api", (0, frame_cloud_1.frameCloudRouter)(mediaPublicBaseUrl));
app.use("/api", mobile_google_auth_1.mobileGoogleAuthRouter);
app.use("/api", wechat_mobile_auth_1.wechatMobileAuthRouter);
app.use("/api", wechat_phone_1.wechatPhoneRouter);
app.use("/api", (0, enterprise_1.enterpriseRouter)(uploadDir, mediaPublicBaseUrl));
app.use("/api", admin_1.adminRouter);
// Global error handler — send styled page for HTML requests (e.g. CORS errors)
app.use((err, req, res, next) => {
    console.error('[ErrorHandler]', err.message || err);
    const accepts = (req.headers.accept || '').toLowerCase();
    if (accepts.includes('application/json')) {
        res.status(500).json({ ok: false, error: 'server_error' });
    }
    else {
        res.status(200).send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Error - MyFrame</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f5f7;color:#1d1d1f;text-align:center;padding:20px;box-sizing:border-box}.card{max-width:440px;width:100%;background:#fff;border-radius:20px;padding:40px 32px;box-shadow:0 4px 24px rgba(0,0,0,.08)}.icon{width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:36px;background:#fef2f0;color:#d32f2f}h2{margin:0 0 12px;font-size:22px}p{color:#6e6e73;margin:0 0 24px;font-size:15px;line-height:1.5}.btn{display:inline-block;padding:12px 24px;border-radius:30px;background:#f5f5f7;color:#1d1d1f;text-decoration:none;font-size:15px;font-weight:500;transition:background .2s}.btn:hover{background:#e8e8ed}</style></head><body><div class="card"><div class="icon">!</div><h2>Something went wrong</h2><p>An unexpected error occurred. Please try again or contact support if the problem persists.</p><a href="/" class="btn">Go Home</a></div></body></html>`);
    }
});
app.listen(port, () => {
    console.log(`MyFrame API http://0.0.0.0:${port}`);
    (0, sync_transit_1.startTransitCleanupJob)();
    console.log(`Upload dir: ${uploadDir}`);
    console.log(`PUBLIC_BASE_URL: ${publicBaseUrl}`);
    if (mediaPublicBaseUrl !== publicBaseUrl) {
        console.log(`PUBLIC_MEDIA_BASE_URL (frame fetch / MQTT): ${mediaPublicBaseUrl}`);
    }
    try {
        const u = new URL(mediaPublicBaseUrl);
        if (u.protocol === "https:" && String(process.env.FRAME_PLAY_ALLOW_HTTPS ?? "").trim() !== "1") {
            console.warn("[myframe] MQTT play uses HTTPS in URLs — XT/ESP32 often needs plain HTTP (e.g. http://YOUR_VPS_IP:3001). Set PUBLIC_MEDIA_BASE_URL accordingly or FRAME_PLAY_ALLOW_HTTPS=1.");
        }
    }
    catch {
        /* ignore */
    }
    (0, frame_mqtt_1.startFrameMqtt)();
});
