import crypto from "crypto";

import { db } from "../db/store";
import { signUserJwt } from "../services/app_user_jwt";
import type { AppleProfile } from "./apple_id_token";

export type AppleAuthSession = {
  token: string;
  user: { id: string; email: string; name: string };
};

export type AppleAuthSessionError = {
  status: number;
  error: string;
};

function fallbackEmail(sub: string): string {
  const hash = crypto.createHash("sha256").update(sub).digest("hex").slice(0, 24);
  return `apple_${hash}@apple.myframe.local`;
}

export function completeAppleLogin(
  profile: AppleProfile,
  hints?: { email?: string; name?: string },
): AppleAuthSession | AppleAuthSessionError {
  const now = Date.now();
  const email = (profile.email || hints?.email || "").trim().toLowerCase() || fallbackEmail(profile.sub);
  const hintedName = String(hints?.name ?? "").trim();
  const name = hintedName || "Apple User";

  const data = db.read();
  let user =
    data.users.find((u) => u.appleSub === profile.sub) ??
    (email.includes("@") ? data.users.find((u) => u.email.toLowerCase() === email) : undefined);

  if (!user) {
    const id = `usr_apple_${now}_${crypto.randomBytes(4).toString("hex")}`;
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
        emailVerified: true,
        createdAtMs: now,
        lastSeenAtMs: now,
        appleSub: profile.sub,
      });
      draft.auditLog.unshift({
        id: `audit_${Date.now()}_${crypto.randomBytes(2).toString("hex")}`,
        actor: `user:${id}`,
        action: "register_apple",
        target: id,
        atMs: Date.now(),
        meta: { email },
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
              appleSub: u.appleSub ?? profile.sub,
              name: u.name?.trim() ? u.name : hintedName || u.name,
              lastSeenAtMs: now,
            }
          : u,
      );
      draft.auditLog.unshift({
        id: `audit_${Date.now()}_${crypto.randomBytes(2).toString("hex")}`,
        actor: `user:${user!.id}`,
        action: "login_apple",
        target: user!.id,
        atMs: Date.now(),
        meta: { email: user!.email },
      });
    });
    user = db.read().users.find((u) => u.id === user!.id);
  }

  if (!user) {
    return { status: 500, error: "apple_user_create_failed" };
  }

  return {
    token: signUserJwt(user.id, user.email),
    user: { id: user.id, email: user.email, name: user.name },
  };
}
