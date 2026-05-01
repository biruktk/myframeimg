import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "fs";
import path from "path";

import { deviceRouter } from "./routes/device";
import { photoRouter } from "./routes/photo";
import { settingsRouter } from "./routes/settings";
import { adminRouter } from "./routes/admin";
import { faqRouter } from "./routes/faq";
import { frameCloudRouter } from "./routes/frame_cloud";
import { startFrameMqtt } from "./services/frame_mqtt";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3001);
const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${port}`).replace(/\/$/, "");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.disable("x-powered-by");
app.set("trust proxy", 1);

const allowedOrigins = String(process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "no-referrer");
  next();
});

app.use(
  cors({
    origin: (origin, cb) => {
      if (allowedOrigins.length === 0 || !origin || allowedOrigins.includes(origin)) {
        cb(null, true);
        return;
      }
      cb(new Error("CORS blocked"));
    },
    credentials: true,
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
  res.json({ ok: true, service: "myframe-server" });
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

app.use("/api", deviceRouter);
app.use("/api", photoRouter(uploadDir, publicBaseUrl));
app.use("/api", settingsRouter);
app.use("/api", adminRouter);
app.use("/api", faqRouter);
app.use("/api", frameCloudRouter(publicBaseUrl));

app.listen(port, () => {
  console.log(`MyFrame API http://0.0.0.0:${port}`);
  console.log(`Upload dir: ${uploadDir}`);
  console.log(`PUBLIC_BASE_URL: ${publicBaseUrl}`);
  startFrameMqtt();
});
