import crypto from "crypto";

import { db } from "../db/store";
import { signUserJwt } from "../services/app_user_jwt";
import type { GoogleProfile } from "./google_id_token";

export type GoogleAuthSession = {
  token: string;
  user: { id: string; email: string; name: string };
};

export type GoogleAuthSessionError = {
  status: number;
  error: string;
};

export function completeGoogleLogin(profile: GoogleProfile): GoogleAuthSession | GoogleAuthSessionError {
  if (!profile.emailVerified) {
    return { status: 403, error: "email_not_verified" };
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
        emailVerified: true,
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
      return { status: 403, error: "account_suspended" };
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
    return { status: 500, error: "user_create_failed" };
  }

  return {
    token: signUserJwt(user.id, user.email),
    user: { id: user.id, email: user.email, name: user.name },
  };
}

export function appDeepLinkFromSession(session: GoogleAuthSession): string {
  const q = new URLSearchParams({
    token: session.token,
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });
  return `myframe://auth/google#${q.toString()}`;
}
