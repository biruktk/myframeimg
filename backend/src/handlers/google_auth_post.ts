import crypto from "crypto";
import type { Request, Response } from "express";

import { db } from "../db/store";
import { signUserJwt } from "../services/app_user_jwt";
import { isGoogleAuthConfigured, verifyGoogleIdToken } from "../services/google_id_token";

function issueToken(userId: string, email: string): string {
  return signUserJwt(userId, email);
}

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

  if (!profile.emailVerified) {
    res.status(403).json({ ok: false, error: "email_not_verified" });
    return;
  }

  const data = db.read();
  let user =
    data.users.find((u) => u.googleSub === profile.sub) ??
    data.users.find((u) => u.email.toLowerCase() === profile.email);

  const now = Date.now();

  if (!user) {
    const id = `usr_${now}_${crypto.randomBytes(4).toString("hex")}`;
    db.mutate((draft) => {
      const fallbackOrgId = draft.organizations[0]?.id ?? "org_default";
      draft.users.push({
        id,
        email: profile.email,
        name: profile.name,
        orgId: fallbackOrgId,
        subscriptionTier: "free",
        familyGroupId: null,
        status: "active",
        createdAtMs: now,
        lastSeenAtMs: now,
        googleSub: profile.sub,
      });
      draft.auditLog.unshift({
        id: `audit_${Date.now()}_${crypto.randomBytes(2).toString("hex")}`,
        actor: `user:${id}`,
        action: "register_google",
        target: id,
        atMs: Date.now(),
        meta: { email: profile.email },
      });
    });
    user = db.read().users.find((u) => u.id === id);
  } else {
    if (user.status !== "active") {
      res.status(403).json({ ok: false, error: "account_suspended" });
      return;
    }
    db.mutate((draft) => {
      draft.users = draft.users.map((u) =>
        u.id === user!.id
          ? {
              ...u,
              googleSub: u.googleSub ?? profile.sub,
              name: u.name?.trim() ? u.name : profile.name,
              lastSeenAtMs: now,
            }
          : u,
      );
      draft.auditLog.unshift({
        id: `audit_${Date.now()}_${crypto.randomBytes(2).toString("hex")}`,
        actor: `user:${user!.id}`,
        action: "login_google",
        target: user!.id,
        atMs: Date.now(),
        meta: { email: user!.email },
      });
    });
    user = db.read().users.find((u) => u.id === user!.id);
  }

  if (!user) {
    res.status(500).json({ ok: false, error: "user_create_failed" });
    return;
  }

  const token = issueToken(user.id, user.email);
  res.json({
    ok: true,
    token,
    user: { id: user.id, email: user.email, name: user.name },
  });
}
