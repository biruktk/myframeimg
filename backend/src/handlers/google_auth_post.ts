import type { Request, Response } from "express";

import { completeGoogleLogin } from "../services/google_auth_session";
import { isGoogleAuthConfigured, verifyGoogleIdToken } from "../services/google_id_token";

/** POST body: `{ idToken: string }` — shared by `/api/auth/google` and `/mobile/google-auth`. */
export async function handleGoogleAuthPost(req: Request, res: Response): Promise<void> {
  if (!isGoogleAuthConfigured()) {
    res.status(503).json({ ok: false, error: "google_auth_not_configured" });
    return;
  }

  const idToken = String(req.body?.idToken ?? "").trim();
  if (!idToken) {
    res.status(400).json({ ok: false, error: "invalid_token" });
    return;
  }

  let profile;
  try {
    profile = await verifyGoogleIdToken(idToken);
  } catch {
    res.status(503).json({ ok: false, error: "google_auth_not_configured" });
    return;
  }

  if (!profile) {
    res.status(401).json({ ok: false, error: "invalid_token" });
    return;
  }

  const session = completeGoogleLogin(profile);
  if ("error" in session) {
    res.status(session.status).json({ ok: false, error: session.error });
    return;
  }

  res.json({
    ok: true,
    token: session.token,
    user: session.user,
  });
}
