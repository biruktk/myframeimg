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
const wechat_mobile_auth_1 = require("./routes/wechat_mobile_auth");
const mini_program_1 = require("./routes/mini_program");
const admin_1 = require("./routes/admin");
const faq_1 = require("./routes/faq");
const frame_cloud_1 = require("./routes/frame_cloud");
const family_1 = require("./routes/family");
const frame_slideshow_1 = require("./routes/frame_slideshow");
const frame_invite_1 = require("./routes/frame_invite");
const enterprise_1 = require("./routes/enterprise");
const devs_1 = require("./routes/devs");
const public_site_1 = require("./routes/public_site");
const user_portal_1 = require("./routes/user_portal");
const user_gallery_1 = require("./routes/user_gallery");
const wechat_phone_1 = require("./routes/wechat_phone");
const mobile_google_auth_1 = require("./routes/mobile_google_auth");
const google_oauth_mobile_1 = require("./services/google_oauth_mobile");
const frame_media_1 = require("./config/frame_media");
const frame_mqtt_1 = require("./services/frame_mqtt");
const frame_logs_1 = require("./services/frame_logs");
const store_1 = require("./db/store");
/** Resolve backend root robustly across different TypeScript outDir layouts. */
const packageRootCandidates = [
    process.cwd(),
    path_1.default.resolve(__dirname, ".."),
    path_1.default.resolve(__dirname, "..", "..", ".."),
];
const packageRoot = packageRootCandidates.find((candidate) => fs_1.default.existsSync(path_1.default.join(candidate, "package.json"))) ??
    packageRootCandidates[0];
process.on("unhandledRejection", (reason) => {
    console.error("[myframe] Unhandled Rejection:", reason instanceof Error ? reason.message : reason);
});
dotenv_1.default.config({ path: path_1.default.join(packageRoot, ".env") });
function envBaseUrl(primary, fallback) {
    return (primary?.trim() || fallback).replace(/\/$/, "");
}
function isAllowedCorsOrigin(origin) {
    const configured = String(process.env.CORS_ORIGINS ?? "").trim();
    if (!origin || configured === "*")
        return true;
    const allowed = configured
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    if (allowed.includes(origin))
        return true;
    if (origin === "null")
        return true;
    if (/^http:\/\/localhost(?::\d+)?$/i.test(origin))
        return true;
    if (/^http:\/\/127\.0\.0\.1(?::\d+)?$/i.test(origin))
        return true;
    return false;
}
const app = (0, express_1.default)();
const port = Number(process.env.PORT || 3001);
const uploadDirSetting = String(process.env.UPLOAD_DIR || "uploads").trim() || "uploads";
const uploadDir = path_1.default.isAbsolute(uploadDirSetting)
    ? uploadDirSetting
    : path_1.default.resolve(packageRoot, uploadDirSetting);
const publicBaseUrl = envBaseUrl(process.env.PUBLIC_BASE_URL, `http://127.0.0.1:${port}`);
/** MQTT `play` + `/frame-media/` links — always port 80 on VPS (see `config/frame_media.ts`). */
const mediaPublicBaseUrl = (0, frame_media_1.normalizedFrameMediaBaseUrl)(publicBaseUrl) || envBaseUrl(process.env.PUBLIC_MEDIA_BASE_URL, publicBaseUrl);
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
const firmwareDir = path_1.default.join(uploadDir, "firmware");
if (!fs_1.default.existsSync(firmwareDir)) {
    fs_1.default.mkdirSync(firmwareDir, { recursive: true });
}
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((req, res, next) => {
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("x-frame-options", "DENY");
    // Google Sign-In (GIS + OAuth) rejects `no-referrer`.
    res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
    next();
});
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (isAllowedCorsOrigin(origin))
            return callback(null, true);
        callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    allowedHeaders: [
        "Content-Type",
        "Authorization",
        "x-pairing-token",
        "x-admin-token",
        "x-frame-token",
        "x-invite-code",
        "x-wechat-mini-secret",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
}));
app.use(express_1.default.json({ limit: "2mb" }));
/** Public URLs for MQTT play payloads (`https://your.host/frame-media/<file>`). */
app.use("/frame-media", express_1.default.static(uploadDir, {
    etag: true,
    maxAge: "1h",
    fallthrough: false,
    index: false,
}));
app.use("/frame-media", (err, _req, res, next) => {
    if (err && (err.status === 404 || err.code === "ENOENT")) {
        res.status(404).json({ ok: false, error: "media_not_found" });
        return;
    }
    next(err);
});
/** Frame OTA binaries (`GET /firmware/myframe-firmware-x.y.z.bin`). */
app.use("/firmware", express_1.default.static(firmwareDir, {
    etag: true,
    maxAge: "1d",
    fallthrough: false,
    index: false,
}));
app.get("/health", (_req, res) => {
    res.json({
        ok: true,
        service: "myframe-server",
        mobileGoogleSignIn: true,
        googleAuthConfigured: Boolean(process.env.GOOGLE_OAUTH_CLIENT_IDS?.trim() || process.env.GOOGLE_CLIENT_ID?.trim()),
        googleOAuthRedirect: (0, google_oauth_mobile_1.isGoogleOAuthRedirectConfigured)(),
        wechatConfigured: Boolean(process.env.WECHAT_MINI_APPID?.trim() && process.env.WECHAT_MINI_APPSECRET?.trim()),
    });
});
/** Mobile Google sign-in — register on app root (survives partial deploys / router issues). */
app.get("/mobile/google-signin", mobile_google_auth_1.handleMobileGoogleSigninGet);
app.get("/mobile/google-oauth-callback", (req, res) => {
    void (0, mobile_google_auth_1.handleMobileGoogleOAuthCallback)(req, res);
});
app.post("/mobile/google-auth", express_1.default.json({ limit: "256kb" }), mobile_google_auth_1.handleMobileGoogleAuthPost);
app.use(mobile_google_auth_1.mobileGoogleAuthRouter);
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
          <li><a href="/mobile/google-signin">/mobile/google-signin</a></li>
          <li><code>GET /api/device/status</code></li>
          <li><code>POST /api/photo/upload</code></li>
          <li><code>POST /api/auth/wechat/login</code></li>
          <li><code>POST /api/auth/wechat/phone</code></li>
        </ul>
      </div>
    </main>
  </body>
</html>`);
});
app.use("/api", public_site_1.publicSiteRouter);
app.use("/api", device_1.deviceRouter);
app.use("/api", auth_1.authRouter);
app.use("/api", wechat_mobile_auth_1.wechatMobileAuthRouter);
app.use("/api", wechat_phone_1.wechatPhoneRouter);
app.use("/api", user_portal_1.userPortalRouter);
app.use("/api", (0, user_gallery_1.userGalleryRouter)(uploadDir, mediaPublicBaseUrl));
app.use("/api", family_1.familyRouter);
app.use("/api", frame_invite_1.frameInviteRouter);
app.use("/api", (0, frame_slideshow_1.frameSlideshowRouter)());
app.use("/api", mini_program_1.miniProgramRouter);
app.use("/api", (0, photo_1.photoRouter)(uploadDir, mediaPublicBaseUrl));
app.use("/api", settings_1.settingsRouter);
// Public / token-scoped routes must be registered before [adminRouter], which applies
// [requireAdminToken] to every request that reaches it.
app.use("/api", faq_1.faqRouter);
app.use("/api", (0, frame_cloud_1.frameCloudRouter)(mediaPublicBaseUrl));
app.use("/api", (0, enterprise_1.enterpriseRouter)(uploadDir, mediaPublicBaseUrl));
app.use("/api", devs_1.devsRouter);
app.use("/api", admin_1.adminRouter);
app.use((_req, res) => {
    res.status(404).json({
        ok: false,
        error: "route_not_found",
        hint: "MyFrame API — /health, /mobile/google-signin, POST /mobile/google-auth, POST /api/auth/google, POST /api/auth/wechat/login",
    });
});
app.listen(port, () => {
    console.log(`MyFrame API http://0.0.0.0:${port}`);
    console.log(`Mobile Google: GET /mobile/google-signin  GET /mobile/google-oauth-callback  POST /mobile/google-auth (oauth redirect: ${(0, google_oauth_mobile_1.isGoogleOAuthRedirectConfigured)()})`);
    console.log(`Upload dir: ${uploadDir}`);
    console.log(`PUBLIC_BASE_URL (API): ${publicBaseUrl}`);
    console.log(`Frame media base (HTTP /frame-media): ${mediaPublicBaseUrl}`);
    (0, frame_media_1.warnIfMisconfiguredFrameMediaEnv)();
    try {
        const play = (0, frame_media_1.frameMediaPlayEndpoint)();
        console.log(`MQTT play target: ${play.host}:${play.port}  imgurl=/frame-media/<file>.bin`);
    }
    catch (e) {
        console.warn("[myframe] MQTT play endpoint:", e instanceof Error ? e.message : e);
    }
    try {
        const u = new URL(mediaPublicBaseUrl);
        if (u.protocol === "https:" && String(process.env.FRAME_PLAY_ALLOW_HTTPS ?? "").trim() !== "1") {
            console.warn("[myframe] Frame media URL is HTTPS — XT/ESP32 usually needs plain HTTP on port 80. Set PUBLIC_MEDIA_BASE_URL=http://YOUR_VPS_IP or FRAME_PLAY_ALLOW_HTTPS=1.");
        }
    }
    catch {
        /* ignore */
    }
    (0, frame_mqtt_1.startFrameMqtt)();
    try {
        const audit = store_1.db.read().auditLog;
        (0, frame_logs_1.seedFrameLogsFromAudit)(audit);
    }
    catch {
        /* ignore */
    }
});
