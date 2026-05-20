import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "fs";
import path from "path";

import { deviceRouter } from "./routes/device";
import { photoRouter } from "./routes/photo";
import { settingsRouter } from "./routes/settings";
import { authRouter } from "./routes/auth";
import { miniProgramRouter } from "./routes/mini_program";
import { adminRouter } from "./routes/admin";
import { faqRouter } from "./routes/faq";
import { frameCloudRouter } from "./routes/frame_cloud";
import { familyRouter } from "./routes/family";
import { frameSlideshowRouter } from "./routes/frame_slideshow";
import { enterpriseRouter } from "./routes/enterprise";
import { publicSiteRouter } from "./routes/public_site";
import { userPortalRouter } from "./routes/user_portal";
import { mobileGoogleAuthRouter } from "./routes/mobile_google_auth";
import { startFrameMqtt } from "./services/frame_mqtt";

/** PM2 often sets `cwd` to the repo root; default dotenv loads `.env` there and misses `backend/.env`. */
const packageRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(packageRoot, ".env") });

function envBaseUrl(primary: string | undefined, fallback: string): string {
  return (primary?.trim() || fallback).replace(/\/$/, "");
}

const app = express();
const port = Number(process.env.PORT || 3001);
const uploadDir = path.resolve(packageRoot, process.env.UPLOAD_DIR || "uploads");
const publicBaseUrl = envBaseUrl(process.env.PUBLIC_BASE_URL, `http://127.0.0.1:${port}`);
/** MQTT `play` + `/frame-media/` links; use when `PUBLIC_BASE_URL` is the marketing site (Next) not Express. */
const mediaPublicBaseUrl = envBaseUrl(process.env.PUBLIC_MEDIA_BASE_URL || publicBaseUrl, publicBaseUrl);

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use((req, res, next) => {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "no-referrer");
  next();
});

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowed = String(process.env.CORS_ORIGINS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (allowed.includes(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
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
  }),
);
app.use(express.json({ limit: "2mb" }));

/** Public URLs for MQTT play payloads (`https://your.host/frame-media/<file>`). */
app.use(
  "/frame-media",
  express.static(uploadDir, {
    etag: true,
    maxAge: "1h",
    fallthrough: false,
    index: false,
  }),
);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "myframe-server",
    mobileGoogleSignIn: true,
    googleAuthConfigured: Boolean(
      process.env.GOOGLE_OAUTH_CLIENT_IDS?.trim() || process.env.GOOGLE_CLIENT_ID?.trim(),
    ),
  });
});

app.use(mobileGoogleAuthRouter);

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

app.use("/api", publicSiteRouter);

app.use("/api", deviceRouter);
app.use("/api", authRouter);
app.use("/api", userPortalRouter);
app.use("/api", familyRouter);
app.use("/api", frameSlideshowRouter());
app.use("/api", miniProgramRouter);
app.use("/api", photoRouter(uploadDir, mediaPublicBaseUrl));
app.use("/api", settingsRouter);
// Public / token-scoped routes must be registered before [adminRouter], which applies
// [requireAdminToken] to every request that reaches it.
app.use("/api", faqRouter);
app.use("/api", frameCloudRouter(mediaPublicBaseUrl));
app.use("/api", enterpriseRouter(uploadDir, mediaPublicBaseUrl));
app.use("/api", adminRouter);

app.use((_req, res) => {
  res.status(404).json({
    ok: false,
    error: "route_not_found",
    hint: "MyFrame API — use /health, /mobile/google-signin, POST /mobile/google-auth, POST /api/auth/google",
  });
});

app.listen(port, () => {
  console.log(`MyFrame API http://0.0.0.0:${port}`);
  console.log(`Upload dir: ${uploadDir}`);
  console.log(`PUBLIC_BASE_URL: ${publicBaseUrl}`);
  if (mediaPublicBaseUrl !== publicBaseUrl) {
    console.log(`PUBLIC_MEDIA_BASE_URL (frame fetch / MQTT): ${mediaPublicBaseUrl}`);
  }
  try {
    const u = new URL(mediaPublicBaseUrl);
    if (u.protocol === "https:" && String(process.env.FRAME_PLAY_ALLOW_HTTPS ?? "").trim() !== "1") {
      console.warn(
        "[myframe] MQTT play uses HTTPS in URLs — XT/ESP32 often needs plain HTTP (e.g. http://YOUR_VPS_IP:3001). Set PUBLIC_MEDIA_BASE_URL accordingly or FRAME_PLAY_ALLOW_HTTPS=1.",
      );
    }
  } catch {
    /* ignore */
  }
  startFrameMqtt();
});
