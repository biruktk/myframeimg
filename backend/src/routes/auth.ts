import crypto from "crypto";
import express, { Router } from "express";
import { db } from "../db/store";
import { signUserJwt, verifyUserJwtBearer } from "../services/app_user_jwt";
import { handleGoogleAuthPost } from "../handlers/google_auth_post";
import { handleAppleAuthPost } from "../handlers/apple_auth_post";
import { sendVerificationEmail, sendPasswordResetEmail, sendPasswordChangedNotification } from "../services/email_service";

export const authRouter = Router();
const TEST_USER_EMAIL = "test@myframe.local";
const TEST_USER_NAME = "Test User";
const TEST_USER_PASSWORD = "test-login-no-credentials";

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
  return signUserJwt(userId, email);
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
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  db.mutate((draft) => {
    const fallbackOrgId = draft.organizations[0]?.id ?? "org_default";
    draft.users.push({
      id,
      email,
      name,
      orgId: fallbackOrgId,
      subscriptionTier: "free",
      familyGroupId: null,
      status: "active",
      emailVerified: false,
      createdAtMs: now,
      lastSeenAtMs: now,
      passwordSalt: saltHex,
      passwordHash: hashHex,
    });
    draft.emailVerifications.push({
      id: `emailver_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      userId: id,
      email,
      tokenHash,
      expiresAtMs: Date.now() + 86_400_000,
      usedAtMs: null,
      createdAtMs: Date.now(),
    });
    draft.settings.account.name = draft.settings.account.name || name;
    draft.settings.account.email = draft.settings.account.email || email;
    draft.auditLog.unshift({
      id: `audit_${Date.now()}_${crypto.randomBytes(2).toString("hex")}`,
      actor: `user:${id}`,
      action: "register",
      target: id,
      atMs: Date.now(),
      meta: { email },
    });
  });

  void sendVerificationEmail(email, rawToken);

  res.status(201).json({
    ok: true,
    message: "verification_email_sent",
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

  if (user.emailVerified === false) {
    res.status(403).json({ ok: false, error: "email_not_verified" });
    return;
  }

  db.mutate((draft) => {
    draft.users = draft.users.map((u) => (u.id === user.id ? { ...u, lastSeenAtMs: Date.now() } : u));
    draft.auditLog.unshift({
      id: `audit_${Date.now()}_${crypto.randomBytes(2).toString("hex")}`,
      actor: `user:${user.id}`,
      action: "login",
      target: user.id,
      atMs: Date.now(),
      meta: { email: user.email },
    });
  });

  const token = issueToken(user.id, user.email);
  res.json({
    ok: true,
    token,
    user: { id: user.id, email: user.email, name: user.name },
  });
});

authRouter.post("/auth/test-login", (_req, res) => {
  const now = Date.now();
  const data = db.read();
  let user = data.users.find((u) => u.email.toLowerCase() === TEST_USER_EMAIL);

  if (!user) {
    const { saltHex, hashHex } = hashNewPassword(TEST_USER_PASSWORD);
    const id = `usr_test_${crypto.randomBytes(4).toString("hex")}`;
    db.mutate((draft) => {
      const fallbackOrgId = draft.organizations[0]?.id ?? "org_default";
      draft.users.push({
        id,
        email: TEST_USER_EMAIL,
        name: TEST_USER_NAME,
        orgId: fallbackOrgId,
        subscriptionTier: "pro",
        familyGroupId: null,
        status: "active",
        createdAtMs: now,
        lastSeenAtMs: now,
        passwordSalt: saltHex,
        passwordHash: hashHex,
      });
    });
    user = db.read().users.find((u) => u.id === id);
  } else {
    db.mutate((draft) => {
      draft.users = draft.users.map((u) => (u.id === user!.id ? { ...u, lastSeenAtMs: now } : u));
      draft.auditLog.unshift({
        id: `audit_${Date.now()}_${crypto.randomBytes(2).toString("hex")}`,
        actor: `user:${user!.id}`,
        action: "test_login",
        target: user!.id,
        atMs: Date.now(),
        meta: { email: user!.email },
      });
    });
  }

  if (!user) {
    res.status(500).json({ ok: false, error: "test_user_create_failed" });
    return;
  }

  const token = issueToken(user.id, user.email);
  res.json({
    ok: true,
    token,
    user: { id: user.id, email: user.email, name: user.name },
    mode: "test",
  });
});

authRouter.post("/auth/google", (req, res) => {
  void handleGoogleAuthPost(req, res);
});

authRouter.post("/auth/apple", (req, res) => {
  void handleAppleAuthPost(req, res);
});

authRouter.get("/auth/session", (req, res) => {
  const authed = verifyUserJwtBearer(req);
  if (!authed) {
    res.status(401).json({ ok: false });
    return;
  }
  const user = db.read().users.find((u) => u.id === authed.userId);
  if (!user || user.status !== "active") {
    res.status(401).json({ ok: false });
    return;
  }
  res.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name },
  });
});

/** Register or update FCM push token for the authenticated user. */
authRouter.post("/auth/fcm-token", (req, res) => {
  const authed = verifyUserJwtBearer(req);
  if (!authed) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  const token = String(req.body?.token ?? "").trim();
  if (!token) {
    res.status(400).json({ ok: false, error: "invalid_token" });
    return;
  }

  db.mutate((draft) => {
    draft.users = draft.users.map((u) => {
      if (u.id !== authed.userId) return u;
      const existing = u.fcmTokens ?? [];
      if (existing.includes(token)) return u;
      return { ...u, fcmTokens: [...existing, token] };
    });
  });

  res.json({ ok: true });
});

authRouter.get("/auth/verify-email", (req, res) => {
  const rawToken = String(req.query?.token ?? "").trim();
  if (!rawToken) {
    res.status(400).json({ ok: false, error: "missing_token" });
    return;
  }

  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const data = db.read();
  const record = data.emailVerifications.find((v) => v.tokenHash === tokenHash);

  if (!record) {
    res.status(404).json({ ok: false, error: "invalid_token" });
    return;
  }
  if (record.usedAtMs !== null) {
    res.status(410).json({ ok: false, error: "token_already_used" });
    return;
  }
  if (Date.now() > record.expiresAtMs) {
    res.status(410).json({ ok: false, error: "token_expired" });
    return;
  }

  db.mutate((draft) => {
    draft.emailVerifications = draft.emailVerifications.map((v) =>
      v.id === record.id ? { ...v, usedAtMs: Date.now() } : v,
    );
    draft.users = draft.users.map((u) => {
      if (u.id !== record.userId) return u;
      return { ...u, emailVerified: true };
    });
    draft.auditLog.unshift({
      id: `audit_${Date.now()}_${crypto.randomBytes(2).toString("hex")}`,
      actor: `user:${record.userId}`,
      action: "email_verified",
      target: record.userId,
      atMs: Date.now(),
      meta: { email: record.email },
    });
  });

  res.json({ ok: true });
});

/** Rate limiter for forgot-password (same pattern as uploadRateLimit). */
const forgotPasswordBucket = new Map<string, { count: number; resetAtMs: number }>();

authRouter.post("/auth/forgot-password", (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email || !email.includes("@")) {
    res.status(400).json({ ok: false, error: "invalid_email" });
    return;
  }

  const now = Date.now();
  const key = `${req.ip}|forgot-password|${email}`;
  const bucket = forgotPasswordBucket.get(key);
  if (bucket && now < bucket.resetAtMs && bucket.count >= 3) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAtMs - now) / 1000));
    res.status(429).json({ ok: false, error: "rate_limited", retry_after_sec: retryAfterSec });
    return;
  }
  if (!bucket || now >= bucket.resetAtMs) {
    forgotPasswordBucket.set(key, { count: 1, resetAtMs: now + 60_000 });
  } else {
    bucket.count += 1;
  }

  const data = db.read();
  const user = data.users.find((u) => u.email.toLowerCase() === email);
  if (!user || !user.passwordSalt) {
    res.json({
      ok: true,
      message: "If that email is registered, a reset link has been sent.",
    });
    return;
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAtMs = Date.now() + 3600_000;

  db.mutate((draft) => {
    draft.passwordResets.push({
      id: `pwreset_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      userId: user.id,
      emailHash: crypto.createHash("sha256").update(email).digest("hex"),
      tokenHash,
      expiresAtMs,
      usedAtMs: null,
      createdAtMs: Date.now(),
    });
    draft.auditLog.unshift({
      id: `audit_${Date.now()}_${crypto.randomBytes(2).toString("hex")}`,
      actor: `user:${user.id}`,
      action: "forgot_password_requested",
      target: user.id,
      atMs: Date.now(),
    });
  });

  void sendPasswordResetEmail(email, rawToken);

  res.json({
    ok: true,
    message: "If that email is registered, a reset link has been sent.",
  });
});

authRouter.get("/auth/reset-password/validate", (req, res) => {
  const rawToken = String(req.query?.token ?? "").trim();
  if (!rawToken) {
    res.status(400).json({ ok: false, error: "missing_token" });
    return;
  }

  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const data = db.read();
  const record = data.passwordResets.find((r) => r.tokenHash === tokenHash);

  if (!record) {
    res.status(404).json({ ok: false, error: "invalid_token" });
    return;
  }
  if (record.usedAtMs !== null) {
    res.status(410).json({ ok: false, error: "token_already_used" });
    return;
  }
  if (Date.now() > record.expiresAtMs) {
    res.status(410).json({ ok: false, error: "token_expired" });
    return;
  }

  res.json({ ok: true });
});

authRouter.post("/auth/reset-password", (req, res) => {
  const rawToken = String(req.body?.token ?? "").trim();
  const newPassword = String(req.body?.password ?? "");

  if (!rawToken) {
    res.status(400).json({ ok: false, error: "missing_token" });
    return;
  }
  if (newPassword.length < 6 || newPassword.length > 256) {
    res.status(400).json({ ok: false, error: "password_length" });
    return;
  }

  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const data = db.read();
  const record = data.passwordResets.find((r) => r.tokenHash === tokenHash);

  if (!record) {
    res.status(404).json({ ok: false, error: "invalid_token" });
    return;
  }
  if (record.usedAtMs !== null) {
    res.status(410).json({ ok: false, error: "token_already_used" });
    return;
  }
  if (Date.now() > record.expiresAtMs) {
    res.status(410).json({ ok: false, error: "token_expired" });
    return;
  }

  const { saltHex, hashHex } = hashNewPassword(newPassword);
  db.mutate((draft) => {
    draft.passwordResets = draft.passwordResets.map((r) =>
      r.id === record.id ? { ...r, usedAtMs: Date.now() } : r,
    );
    draft.users = draft.users.map((u) => {
      if (u.id !== record.userId) return u;
      return { ...u, passwordSalt: saltHex, passwordHash: hashHex };
    });
    draft.auditLog.unshift({
      id: `audit_${Date.now()}_${crypto.randomBytes(2).toString("hex")}`,
      actor: `user:${record.userId}`,
      action: "password_reset",
      target: record.userId,
      atMs: Date.now(),
    });
  });

  const user = db.read().users.find((u) => u.id === record.userId);
  if (user) {
    void sendPasswordChangedNotification(user.email);
  }

  res.json({ ok: true });
});
