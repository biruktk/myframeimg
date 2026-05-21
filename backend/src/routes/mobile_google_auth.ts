import type { Request, Response } from "express";
import express, { Router } from "express";
import { handleGoogleAuthPost } from "../handlers/google_auth_post";
import { isGoogleAuthConfigured } from "../services/google_id_token";
import {
  buildGoogleOAuthAuthorizeUrl,
  exchangeGoogleOAuthCode,
  googleConsoleSetupLines,
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
  const lines = googleConsoleSetupLines(req)
    .map((l) => `<li><code>${escapeHtml(l)}</code></li>`)
    .join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>MyFrame — Google setup</title>
  <style>
    body{font-family:system-ui,sans-serif;margin:0;background:#f7f2ed;color:#111;padding:24px}
    .card{background:#fffbf8;border-radius:16px;padding:24px;max-width:420px;margin:8vh auto}
    h1{font-size:1.2rem}
    code{font-size:.8rem;word-break:break-all}
    ul{padding-left:1.2rem;line-height:1.6}
  </style>
</head>
<body>
  <div class="card">
    <h1>Google Sign-In — server setup</h1>
    <p>Add these in <a href="https://console.cloud.google.com/apis/credentials">Google Cloud Console</a> for the <strong>Web</strong> OAuth client, then set secrets on the VPS:</p>
    <ul>${lines}</ul>
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
