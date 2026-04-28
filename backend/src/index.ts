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
import { inkjoyRouter } from "./routes/inkjoy";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3001);
const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

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

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "myframe-server" });
});

app.use("/api", deviceRouter);
app.use("/api", photoRouter(uploadDir));
app.use("/api", settingsRouter);
app.use("/api", adminRouter);
app.use("/api", faqRouter);
app.use("/api", inkjoyRouter);

app.listen(port, () => {
  console.log(`MyFrame API http://0.0.0.0:${port}`);
  console.log(`Upload dir: ${uploadDir}`);
});
