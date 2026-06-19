import type { Request, Response } from "express";

import { completeAppleLogin } from "../services/apple_auth_session";
import { isAppleAuthConfigured, verifyAppleIdentityToken } from "../services/apple_id_token";

/** POST body: identityToken (+ optional email, name from first Apple sign-in). */
export async function handleAppleAuthPost(req: Request, res: Response): Promise<void> {
  if (!isAppleAuthConfigured()) {
    res.status(503).json({ ok: false, error: "apple_auth_not_configured" });
    return;
  }

  const identityToken = String(
    req.body?.identityToken ?? req.body?.identity_token ?? "",
  ).trim();
  if (!identityToken) {
    res.status(400).json({ ok: false, error: "invalid_token" });
    return;
  }

  let profile;
  try {
    profile = await verifyAppleIdentityToken(identityToken);
  } catch {
    res.status(503).json({ ok: false, error: "apple_auth_not_configured" });
    return;
  }

  if (!profile) {
    res.status(401).json({ ok: false, error: "invalid_token" });
    return;
  }

  const email = String(req.body?.email ?? "").trim();
  const name = String(req.body?.name ?? "").trim();
  const session = completeAppleLogin(profile, {
    email: email || undefined,
    name: name || undefined,
  });

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
