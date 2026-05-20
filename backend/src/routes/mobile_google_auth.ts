import express, { Router } from "express";
import { googleOAuthClientIds, isGoogleAuthConfigured } from "../services/google_id_token";
import { handleGoogleAuthPost } from "../handlers/google_auth_post";

export const mobileGoogleAuthRouter = Router();
mobileGoogleAuthRouter.use(express.json({ limit: "256kb" }));

/** Same handler as POST /api/auth/google — colocated with the sign-in page. */
mobileGoogleAuthRouter.post("/mobile/google-auth", (req, res) => void handleGoogleAuthPost(req, res));

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** In-app browser Google Sign-In (Android fallback). Add this page origin to Web client “Authorized JavaScript origins”. */
mobileGoogleAuthRouter.get("/mobile/google-signin", (_req, res) => {
  if (!isGoogleAuthConfigured()) {
    res.status(503).type("html").send("<p>Google Sign-In is not configured on the server.</p>");
    return;
  }

  const clientId = googleOAuthClientIds()[0] ?? "";
  if (!clientId) {
    res.status(503).type("html").send("<p>Google Sign-In is not configured on the server.</p>");
    return;
  }

  const cid = escapeHtml(clientId);
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>MyFrame — Google Sign-In</title>
  <script src="https://accounts.google.com/gsi/client" async defer></script>
  <style>
    body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#f7f2ed;color:#111;display:flex;min-height:100vh;align-items:center;justify-content:center}
    .card{background:#fffbf8;border-radius:16px;padding:28px 24px;max-width:360px;width:92%;box-shadow:0 8px 32px rgba(0,0,0,.08);text-align:center}
    h1{font-size:1.25rem;margin:0 0 8px}
    p{margin:0 0 20px;font-size:.9rem;color:#555;line-height:1.45}
    #btn{display:flex;justify-content:center;min-height:44px}
    #err{color:#b91c1c;font-size:.85rem;margin-top:16px;white-space:pre-wrap}
  </style>
</head>
<body>
  <div class="card">
    <h1>MyFrame</h1>
    <p>Sign in with Google to return to the app.</p>
    <div id="btn"></div>
    <p id="err" hidden></p>
  </div>
  <script>
    const CLIENT_ID = "${cid}";
    const API_BASE = window.location.origin.replace(/\\/$/, "");
    const AUTH_URL = API_BASE + "/mobile/google-auth";
    const errEl = document.getElementById("err");
    function showErr(msg) {
      errEl.hidden = false;
      errEl.textContent = msg;
    }
    function formatApiError(status, data) {
      if (data && data.error) return String(data.error);
      if (status === 404) return "API route not found. Redeploy backend (npm ci && npm run build && pm2 restart myframe-api).";
      return "Sign-in failed (" + status + ")";
    }
    function returnToApp(payload) {
      const q = new URLSearchParams({
        token: payload.token,
        userId: payload.user.id,
        email: payload.user.email,
        name: payload.user.name,
      });
      window.location.href = "myframe://auth/google#" + q.toString();
    }
    function boot() {
      if (!window.google?.accounts?.id) {
        setTimeout(boot, 80);
        return;
      }
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: async (resp) => {
          const credential = (resp.credential || "").trim();
          if (!credential) return;
          errEl.hidden = true;
          try {
            const res = await fetch(AUTH_URL, {
              method: "POST",
              headers: { "content-type": "application/json", accept: "application/json" },
              body: JSON.stringify({ idToken: credential }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.ok) {
              showErr(formatApiError(res.status, data));
              return;
            }
            returnToApp({ token: data.token, user: data.user });
          } catch {
            showErr("Network error. Check connection and try again.");
          }
        },
      });
      const host = document.getElementById("btn");
      host.innerHTML = "";
      window.google.accounts.id.renderButton(host, {
        theme: "outline",
        size: "large",
        width: 300,
        text: "continue_with",
      });
    }
    window.addEventListener("load", boot);
  </script>
</body>
</html>`);
});
