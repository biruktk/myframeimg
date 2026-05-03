import crypto from "crypto";
import express, { Router } from "express";
import jwt from "jsonwebtoken";
import { db } from "../db/store";

export const authRouter = Router();

function jwtSecret(): string {
  const s = String(process.env.APP_JWT_SECRET ?? process.env.ADMIN_TOKEN ?? "").trim();
  if (s.length >= 16) return s;
  return "myframe-dev-change-JWT_SECRET";
}

function hashPassword(password: string, saltHex: string): string {
  const salt = Buffer.from(saltHex, "hex");
  return crypto.scryptSync(password.normalize("NFKC"), salt, 64).toString("hex");
}

function hashNewPassword(password: string): { saltHex: string; hashHex: string } {
  const salt = crypto.randomBytes(16);
  const saltHex = salt.toString("hex");
  const hashHex = hashPassword(password, saltHex);
  return { saltHex, hashHex };
}

function issueToken(userId: string, email: string): string {
  return jwt.sign({ sub: userId, email }, jwtSecret(), { expiresIn: "30d" });
}

function normalizeEmail(email: unknown): string {
  return String(email ?? "").trim().toLowerCase();
}

authRouter.use(express.json({ limit: "256kb" }));

authRouter.post("/auth/register", (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password ?? "");
  const name = String(req.body?.name ?? "").trim();

  if (!email || email.length > 254 || !email.includes("@")) {
    res.status(400).json({ ok: false, error: "invalid_email" });
    return;
  }
  if (password.length < 6 || password.length > 256) {
    res.status(400).json({ ok: false, error: "password_length" });
    return;
  }
  if (!name || name.length > 128) {
    res.status(400).json({ ok: false, error: "invalid_name" });
    return;
  }

  const data = db.read();
  if (data.users.some((u) => u.email.toLowerCase() === email)) {
    res.status(409).json({ ok: false, error: "email_taken" });
    return;
  }

  const now = Date.now();
  const { saltHex, hashHex } = hashNewPassword(password);
  const id = `usr_${now}_${crypto.randomBytes(4).toString("hex")}`;

  db.mutate((draft) => {
    draft.users.push({
      id,
      email,
      name,
      subscriptionTier: "free",
      familyGroupId: null,
      status: "active",
      createdAtMs: now,
      lastSeenAtMs: now,
      passwordSalt: saltHex,
      passwordHash: hashHex,
    });
    draft.settings.account.name = draft.settings.account.name || name;
    draft.settings.account.email = draft.settings.account.email || email;
  });

  const token = issueToken(id, email);
  res.status(201).json({
    ok: true,
    token,
    user: { id, email, name },
  });
});

authRouter.post("/auth/login", (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password ?? "");

  if (!email || !password) {
    res.status(400).json({ ok: false, error: "invalid_credentials" });
    return;
  }

  const data = db.read();
  const user = data.users.find((u) => u.email.toLowerCase() === email);
  if (!user?.passwordSalt || !user.passwordHash) {
    res.status(401).json({ ok: false, error: "invalid_credentials" });
    return;
  }

  const attempt = hashPassword(password, user.passwordSalt);
  const aBuf = Buffer.from(attempt, "hex");
  const stored = Buffer.from(user.passwordHash, "hex");
  if (aBuf.length !== stored.length || !crypto.timingSafeEqual(aBuf, stored)) {
    res.status(401).json({ ok: false, error: "invalid_credentials" });
    return;
  }

  if (user.status !== "active") {
    res.status(403).json({ ok: false, error: "account_suspended" });
    return;
  }

  db.mutate((draft) => {
    draft.users = draft.users.map((u) => (u.id === user.id ? { ...u, lastSeenAtMs: Date.now() } : u));
  });

  const token = issueToken(user.id, user.email);
  res.json({
    ok: true,
    token,
    user: { id: user.id, email: user.email, name: user.name },
  });
});
