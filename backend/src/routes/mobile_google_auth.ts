import type { Request, Response } from "express";
import express, { Router } from "express";
import { handleGoogleAuthPost } from "../handlers/google_auth_post";
import { isGoogleAuthConfigured } from "../services/google_id_token";
import {
  buildGoogleOAuthAuthorizeUrl,
  exchangeGoogleOAuthCode,
  googleConsoleSetupLines,
  googleOAuthRedirectUri,
  isGoogleOAuthRedirectConfigured,
} from "../services/google_oauth_mobile";

export const mobileGoogleAuthRouter = Router();
mobileGoogleAuthRouter.use(express.json({ limit: "256kb" }));

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setupHtml(req: Request): string {
  const redirect = googleOAuthRedirectUri(req);
  const checklist = googleConsoleSetupLines(req);
  const linesHtml = checklist.map((l) => `<li><code>${escapeHtml(l)}</code></li>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>MyFrame — Google setup</title>
  <style>
    body{font-family:system-ui,sans-serif;margin:0;background:#f7f2ed;color:#111;padding:24px}
    .card{background:#fffbf8;border-radius:16px;padding:24px;max-width:440px;margin:6vh auto}
    h1{font-size:1.2rem}
    .note{background:#fff3cd;border-radius:8px;padding:12px;margin:12px 0;font-size:.9rem}
    code{font-size:.78rem;word-break:break-all}
    ol{padding-left:1.2rem;line-height:1.65}
    ol li{margin:.5rem 0}
  </style>
</head>
<body>
  <div class="card">
    <h1>Google Sign-In — finish server setup</h1>
    <p class="note"><strong>Why you see this:</strong> the API is missing <code>GOOGLE_OAUTH_CLIENT_SECRET</code> in <code>backend/.env</code>. Complete the steps below, restart the API, then try Google sign-in again in the app.</p>
    <ol>
      <li>Open <a href="https://console.cloud.google.com/apis/credentials">Google Cloud Console → Credentials</a> → your <strong>Web application</strong> client.</li>
      <li>Under <strong>Authorized redirect URIs</strong>, add exactly:<br/><code>${escapeHtml(redirect)}</code></li>
    <ol start="3">
      <li>OAuth consent screen → if <strong>Testing</strong>, add your Gmail under <strong>Test users</strong>.</li>
      <li>Copy the Web client <strong>Client secret</strong> (<code>GOCSPX-…</code>) into VPS <code>backend/.env</code>:</li>
    </ol>
    <p><code>GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-your-secret</code></p>
    <p>Then: <code>npm run build && pm2 restart myframe-api</code></p>
    <p>Check: <code>curl -s http://127.0.0.1:3001/health</code> → <code>"googleOAuthRedirect":true</code></p>
    <details style="margin-top:16px"><summary>Full checklist</summary><ul>${linesHtml}</ul></details>
  </div>
</body>
</html>`;
}

/** GET /mobile/google-signin — redirects to Google OAuth (Custom Tab / browser). */
export function handleMobileGoogleSigninGet(req: Request, res: Response): void {
  if (!isGoogleAuthConfigured()) {
    res.status(503).type("html").send("<p>Google Sign-In is not configured on the server.</p>");
    return;
  }

  if (isGoogleOAuthRedirectConfigured()) {
    res.redirect(302, buildGoogleOAuthAuthorizeUrl(req));
    return;
  }

  res.status(503).type("html").send(setupHtml(req));
}

/** GET /mobile/google-oauth-callback?code=… — exchange code, redirect to app. */
export async function handleMobileGoogleOAuthCallback(req: Request, res: Response): Promise<void> {
  const oauthError = String(req.query.error ?? "").trim();
  if (oauthError) {
    const desc = String(req.query.error_description ?? oauthError);
    res.status(400).type("html").send(
      `<!doctype html><html><body style="font-family:system-ui;padding:24px"><h1>Google sign-in cancelled</h1><p>${escapeHtml(desc)}</p></body></html>`,
    );
    return;
  }

  const code = String(req.query.code ?? "").trim();
  if (!code) {
    res.status(400).type("html").send("<p>Missing authorization code.</p>");
    return;
  }

  const result = await exchangeGoogleOAuthCode(code, req);
  if (!result.ok) {
    res.status(result.status).type("html").send(
      `<!doctype html><html><body style="font-family:system-ui;padding:24px"><h1>Sign-in failed</h1><p>${escapeHtml(result.error)}</p>${
        result.message ? `<pre>${escapeHtml(result.message)}</pre>` : ""
      }</body></html>`,
    );
    return;
  }

  res.redirect(302, result.deepLink);
}

/** POST /mobile/google-auth */
export function handleMobileGoogleAuthPost(req: Request, res: Response): void {
  void handleGoogleAuthPost(req, res);
}

mobileGoogleAuthRouter.get("/mobile/google-signin", handleMobileGoogleSigninGet);
mobileGoogleAuthRouter.get("/mobile/google-oauth-callback", (req, res) => {
  void handleMobileGoogleOAuthCallback(req, res);
});
mobileGoogleAuthRouter.post("/mobile/google-auth", handleMobileGoogleAuthPost);
