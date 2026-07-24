import nodemailer from "nodemailer";

import { isFirebaseConfigured, sendPushToUser } from "./firebase_admin";
import { db } from "../db/store";

export function isSmtpConfigured(): boolean {
  const host = String(process.env.SMTP_HOST ?? "").trim();
  const user = String(process.env.SMTP_USER ?? "").trim();
  return !!(host && user);
}

function makeTransporter(): nodemailer.Transporter | null {
  const host = String(process.env.SMTP_HOST ?? "").trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = String(process.env.SMTP_USER ?? "").trim();
  const pass = String(process.env.SMTP_PASS ?? "").trim();
  const from = String(process.env.SMTP_FROM ?? "").trim();

  if (!host || !user || !pass || !from) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

function fromAddress(): string {
  return String(process.env.SMTP_FROM ?? "noreply@myframe.ink").trim();
}

function publicBaseUrl(): string {
  return String(process.env.PUBLIC_BASE_URL ?? "http://127.0.0.1:3001").trim().replace(/\/+$/, "");
}

/** Send verification email after registration. */
export async function sendVerificationEmail(email: string, rawToken: string): Promise<void> {
  const transporter = makeTransporter();
  const from = fromAddress();
  const baseUrl = publicBaseUrl();

  const appDeepLink = `myframe://auth/verify-email#token=${rawToken}`;
  const webFallbackUrl = `${baseUrl}/api/auth/verify-email?token=${rawToken}`;

  const subject = "MyFrame – Verify your email";

  if (transporter) {
    await transporter.sendMail({
      from,
      to: email,
      subject,
      html: `
        <p>Thank you for creating a MyFrame account.</p>
        <p>Click the link below to verify your email address (opens in the MyFrame app):</p>
        <p><a href="${appDeepLink}">${appDeepLink}</a></p>
        <p>If the app link doesn't work, use this link in your browser:</p>
        <p><a href="${webFallbackUrl}">${webFallbackUrl}</a></p>
        <p>This link expires in 24 hours.</p>
      `,
      text: `Thank you for creating a MyFrame account.\n\nVerify your email:\n${appDeepLink}\n\nOr open in browser:\n${webFallbackUrl}\n\nThis link expires in 24 hours.`,
    });
  }
}

/** Send the reset-password email with a deep-link token. */
export async function sendPasswordResetEmail(email: string, rawToken: string): Promise<void> {
  const transporter = makeTransporter();
  const from = fromAddress();
  const baseUrl = publicBaseUrl();

  const appDeepLink = `myframe://auth/reset-password#token=${rawToken}`;
  const webFallbackUrl = `${baseUrl}/auth/reset-password?token=${rawToken}`;

  const subject = "MyFrame – Reset your password";

  if (transporter) {
    await transporter.sendMail({
      from,
      to: email,
      subject,
      html: `
        <p>You requested a password reset for your MyFrame account.</p>
        <p>Click the link below to reset your password (opens in the MyFrame app):</p>
        <p><a href="${appDeepLink}">${appDeepLink}</a></p>
        <p>If the app link doesn't work, use this link in your browser:</p>
        <p><a href="${webFallbackUrl}">${webFallbackUrl}</a></p>
        <p>This link expires in 1 hour.</p>
        <p>If you didn't request this, ignore this email.</p>
      `,
      text: `You requested a password reset for your MyFrame account.\n\nUse this link in the MyFrame app:\n${appDeepLink}\n\nOr open in browser:\n${webFallbackUrl}\n\nThis link expires in 1 hour.`,
    });
  }

  const data = db.read();
  const user = data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (user) {
    await sendPushToUser(user.id, "Password Reset Requested", "A password reset was requested for your account.");
  }
}

export async function sendPasswordChangedNotification(email: string): Promise<void> {
  const transporter = makeTransporter();
  const from = fromAddress();

  if (transporter) {
    await transporter.sendMail({
      from,
      to: email,
      subject: "MyFrame – Your password has been changed",
      html: `<p>Your MyFrame account password was changed successfully.</p><p>If you did not make this change, contact support immediately.</p>`,
      text: "Your MyFrame account password was changed successfully. If you did not make this change, contact support immediately.",
    });
  }

  const data = db.read();
  const user = data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (user) {
    await sendPushToUser(user.id, "Password Changed", "Your MyFrame account password was changed successfully.");
  }
}
