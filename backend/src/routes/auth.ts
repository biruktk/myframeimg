import crypto from "crypto";
import express, { Router } from "express";
import { db } from "../db/store";
import { signUserJwt, verifyUserJwtBearer } from "../services/app_user_jwt";
import { handleGoogleAuthPost } from "../handlers/google_auth_post";
import { handleAppleAuthPost } from "../handlers/apple_auth_post";
import { isSmtpConfigured, sendVerificationEmail, sendPasswordResetEmail, sendPasswordChangedNotification } from "../services/email_service";

export const authRouter = Router();


/** Return JSON or HTML based on Accept header. */
function renderStatusCard(title: string, message: string, isSuccess: boolean): string {
  const color = isSuccess ? "#E53935" : "#D32F2F";
  const icon = isSuccess ? "&#10003;" : "&#10007;";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - MyFrame</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8f9fa; }
    .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); text-align: center; max-width: 400px; width: 90%; }
    .icon { width: 64px; height: 64px; background: ${color}; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 32px; }
    h1 { font-size: 22px; color: #111; margin-bottom: 8px; }
    p { color: #666; font-size: 14px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

function sendJsonOrHtml(
  req: any,
  res: any,
  status: number,
  jsonBody: Record<string, unknown>,
  htmlTitle: string,
  htmlBody: string,
): void {
  const accept = (req.headers.accept || "").toLowerCase();
  if (accept.includes("application/json")) {
    res.status(status).json(jsonBody);
    return;
  }
  res.status(status).send(renderStatusCard(htmlTitle, htmlBody, htmlTitle !== "Server Error" && htmlTitle !== "Invalid Link" && htmlTitle !== "Link Expired" && htmlTitle !== "Link Already Used" && htmlTitle !== "Missing Token" && htmlTitle !== "Invalid Password"));
}
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
authRouter.use(express.urlencoded({ extended: true }));

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
  const smtpAvailable = isSmtpConfigured();

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
      emailVerified: !smtpAvailable,
      createdAtMs: now,
      lastSeenAtMs: now,
      passwordSalt: saltHex,
      passwordHash: hashHex,
    });
    if (smtpAvailable) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      draft.emailVerifications.push({
        id: `emailver_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
        userId: id,
        email,
        tokenHash,
        expiresAtMs: Date.now() + 86_400_000,
        usedAtMs: null,
        createdAtMs: Date.now(),
      });
      void sendVerificationEmail(email, rawToken);
    }
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

  if (smtpAvailable) {
    res.status(201).json({
      ok: true,
      message: "verification_email_sent",
    });
  } else {
    const token = issueToken(id, email);
    res.status(201).json({
      ok: true,
      token,
      user: { id, email, name },
    });
  }
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
    res.status(403).json({ ok: false, error: "email_not_verified", message: "Please verify your email before logging in." });
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

  const accept = (req.headers.accept || "").toLowerCase();
  if (accept.includes("application/json")) {
    res.json({ ok: true });
    return;
  }

  res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Verified - MyFrame</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f8f9fa; }
    .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); text-align: center; max-width: 400px; width: 90%; }
    .icon { width: 64px; height: 64px; background: #E53935; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 32px; }
    h1 { font-size: 22px; color: #111; margin-bottom: 8px; }
    p { color: #666; font-size: 14px; line-height: 1.5; margin-bottom: 24px; }
    .button { display: inline-block; background: #E53935; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 500; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#10003;</div>
    <h1>Email Verified!</h1>
    <p>Your email address has been successfully verified. You can now return to the <strong>MyFrame</strong> app and sign in.</p>
  </div>
</body>
</html>`);
});

authRouter.get("/auth/verify-email", (req, res) => {
  try {
    const rawToken = String(req.query?.token ?? "").trim();
    if (!rawToken) {
      sendJsonOrHtml(req, res, 400, { ok: false, error: "missing_token" }, "Missing Token", "This verification link is missing a token. Please use the full link from your email.");
      return;
    }

    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const data = db.read();
    const record = data.emailVerifications.find((v) => v.tokenHash === tokenHash);

    if (!record) {
      sendJsonOrHtml(req, res, 404, { ok: false, error: "invalid_token" }, "Invalid Link", "This verification link is invalid or was not found. Please check your email for the correct link.");
      return;
    }
    if (record.usedAtMs !== null) {
      sendJsonOrHtml(req, res, 410, { ok: false, error: "token_already_used" }, "Already Verified", "This link has already been used. Your email is already verified. Please sign in to your account.");
      return;
    }
    if (Date.now() > record.expiresAtMs) {
      sendJsonOrHtml(req, res, 410, { ok: false, error: "token_expired" }, "Link Expired", "This verification link has expired. Please request a new verification email from the app.");
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

    const accept = (req.headers.accept || "").toLowerCase();
    if (accept.includes("application/json")) {
      res.json({ ok: true });
      return;
    }

    res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Verified - MyFrame</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f8f9fa; }
    .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); text-align: center; max-width: 400px; width: 90%; }
    .icon { width: 64px; height: 64px; background: #E53935; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 32px; }
    h1 { font-size: 22px; color: #111; margin-bottom: 8px; }
    p { color: #666; font-size: 14px; line-height: 1.5; margin-bottom: 24px; }
    .button { display: inline-block; background: #E53935; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 500; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#10003;</div>
    <h1>Email Verified!</h1>
    <p>Your email address has been successfully verified. You can now return to the <strong>MyFrame</strong> app and sign in.</p>
  </div>
</body>
</html>`);
  } catch (err) {
    console.error("verify-email error:", err);
    sendJsonOrHtml(req, res, 500, { ok: false, error: "server_error" }, "Server Error", "An unexpected error occurred. Please try again later or contact support.");
  }
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


authRouter.post("/auth/resend-verification", (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!email || !email.includes("@")) {
    res.status(400).json({ ok: false, error: "invalid_email" });
    return;
  }

  const data = db.read();
  const user = data.users.find((u) => u.email.toLowerCase() === email);
  if (!user) {
    res.status(404).json({ ok: false, error: "user_not_found" });
    return;
  }
  if (user.emailVerified) {
    res.status(400).json({ ok: false, error: "already_verified" });
    return;
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  db.mutate((draft) => {
    draft.emailVerifications.push({
      id: "emailver_" + Date.now() + "_" + crypto.randomBytes(4).toString("hex"),
      userId: user.id,
      email,
      tokenHash,
      expiresAtMs: Date.now() + 86_400_000,
      usedAtMs: null,
      createdAtMs: Date.now(),
    });
  });

  void sendVerificationEmail(email, rawToken);

  res.json({ ok: true, message: "verification_email_sent" });
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
  try {
    const rawToken = String(req.body?.token ?? "").trim();
    const newPassword = String(req.body?.password ?? "");

    if (!rawToken || !newPassword) {
      const accept = (req.headers.accept || "").toLowerCase();
      if (accept.includes("application/json")) {
        res.status(400).json({ ok: false, error: "missing_fields" });
        return;
      }
      res.status(200).send(renderStatusCard("Error", "Missing token or new password field.", false));
      return;
    }
    if (newPassword.length < 6 || newPassword.length > 256) {
      const accept = (req.headers.accept || "").toLowerCase();
      if (accept.includes("application/json")) {
        res.status(400).json({ ok: false, error: "password_length" });
        return;
      }
      res.status(200).send(renderStatusCard("Invalid Password", "Password must be between 6 and 256 characters.", false));
      return;
    }

    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const data = db.read();
    const record = data.passwordResets.find((r) => r.tokenHash === tokenHash);

    if (!record || record.usedAtMs !== null || Date.now() > record.expiresAtMs) {
      const accept = (req.headers.accept || "").toLowerCase();
      if (accept.includes("application/json")) {
        res.status(400).json({ ok: false, error: "invalid_token" });
        return;
      }
      res.status(200).send(renderStatusCard("Link Expired or Already Used", "This password reset link is invalid or has already been used.", false));
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
      sendPasswordChangedNotification(user.email).catch((e) => {
        console.error("password-changed notification failed:", e);
      });
    }

    const accept = (req.headers.accept || "").toLowerCase();
    if (accept.includes("application/json")) {
      res.json({ ok: true });
      return;
    }

    res.status(200).send(renderStatusCard("Password Reset Successful!", "Your password has been updated. You can now open the MyFrame app and sign in with your new password.", true));
  } catch (error) {
    console.error("POST /auth/reset-password error:", error);
    const accept = (req.headers.accept || "").toLowerCase();
    if (accept.includes("application/json")) {
      res.status(500).json({ ok: false, error: "server_error" });
      return;
    }
    res.status(200).send(renderStatusCard("Reset Failed", "An error occurred while resetting your password. Please request a new link.", false));
  }
});


authRouter.get("/auth/reset-password", (req, res) => {
  try {
    const rawToken = String(req.query?.token ?? "").trim();
    if (!rawToken) {
      const accept = (req.headers.accept || "").toLowerCase();
      if (accept.includes("application/json")) {
        res.status(400).json({ ok: false, error: "missing_token" });
        return;
      }
      res.status(400).send(renderStatusCard("Invalid Request", "Missing reset token.", false));
      return;
    }

    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const data = db.read();
    const record = data.passwordResets.find((r) => r.tokenHash === tokenHash);

    if (!record) {
      const accept = (req.headers.accept || "").toLowerCase();
      if (accept.includes("application/json")) {
        res.status(404).json({ ok: false, error: "invalid_token" });
        return;
      }
      res.status(400).send(renderStatusCard("Link Expired", "This password reset link is invalid or has already been used. Please request a new one.", false));
      return;
    }
    if (record.usedAtMs !== null) {
      const accept = (req.headers.accept || "").toLowerCase();
      if (accept.includes("application/json")) {
        res.status(410).json({ ok: false, error: "token_already_used" });
        return;
      }
      res.status(400).send(renderStatusCard("Link Expired", "This password reset link has already been used. Please request a new one.", false));
      return;
    }
    if (Date.now() > record.expiresAtMs) {
      const accept = (req.headers.accept || "").toLowerCase();
      if (accept.includes("application/json")) {
        res.status(410).json({ ok: false, error: "token_expired" });
        return;
      }
      res.status(400).send(renderStatusCard("Link Expired", "This password reset link has expired. Please request a new one.", false));
      return;
    }

    const accept = (req.headers.accept || "").toLowerCase();
    if (accept.includes("application/json")) {
      res.json({ ok: true, token: rawToken });
      return;
    }

    res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Password - MyFrame</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8f9fa; }
    .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); width: 90%; max-width: 360px; text-align: center; }
    h2 { margin-bottom: 24px; color: #111; }
    input { width: 100%; padding: 12px; margin-bottom: 16px; border: 1px solid #e0e0e0; border-radius: 8px; box-sizing: border-box; font-size: 14px; }
    button { width: 100%; padding: 12px; background: #E53935; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 15px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Reset Your Password</h2>
    <form action="/auth/reset-password" method="POST">
      <input type="hidden" name="token" value="${rawToken}" />
      <input type="password" name="password" placeholder="New password (min 6 characters)" required minlength="6" />
      <button type="submit">Update Password</button>
    </form>
  </div>
</body>
</html>`);
  } catch (err) {
    console.error("GET /auth/reset-password error:", err);
    const accept = (req.headers.accept || "").toLowerCase();
    if (accept.includes("application/json")) {
      res.status(500).json({ ok: false, error: "server_error" });
      return;
    }
    res.status(200).send(renderStatusCard("Server Error", "Something went wrong. Please try again.", false));
  }
});

// Catch-all error handler for auth routes
authRouter.use((err: any, req: any, res: any, _next: any) => {
  console.error("authRouter unhandled error:", err);
  const accept = (req.headers.accept || "").toLowerCase();
  if (accept.includes("application/json")) {
    res.status(500).json({ ok: false, error: "server_error" });
  } else {
    res.status(500).type("html").send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Server Error - MyFrame</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8f9fa}.card{background:white;padding:40px;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.08);text-align:center;max-width:400px;width:90%}.icon{width:64px;height:64px;background:#E53935;color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:32px}h1{font-size:22px;color:#111;margin-bottom:8px}p{color:#666;font-size:14px;line-height:1.5}</style>
</head>
<body><div class="card"><div class="icon">&#10003;</div><h1>Server Error</h1><p>An unexpected error occurred. Please try again.</p></div></body>
</html>`);
  }
});
