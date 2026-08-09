"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.completeGoogleLogin = completeGoogleLogin;
exports.appDeepLinkFromSession = appDeepLinkFromSession;
const crypto_1 = __importDefault(require("crypto"));
const store_1 = require("../db/store");
const app_user_jwt_1 = require("../services/app_user_jwt");
function completeGoogleLogin(profile) {
    if (!profile.emailVerified) {
        return { status: 403, error: "email_not_verified" };
    }
    const data = store_1.db.read();
    let user = data.users.find((u) => u.googleSub === profile.sub) ??
        data.users.find((u) => u.email.toLowerCase() === profile.email);
    const now = Date.now();
    if (!user) {
        const id = `usr_${now}_${crypto_1.default.randomBytes(4).toString("hex")}`;
        store_1.db.mutate((draft) => {
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
                id: `audit_${Date.now()}_${crypto_1.default.randomBytes(2).toString("hex")}`,
                actor: `user:${id}`,
                action: "register_google",
                target: id,
                atMs: Date.now(),
                meta: { email: profile.email },
            });
        });
        user = store_1.db.read().users.find((u) => u.id === id);
    }
    else {
        if (user.status !== "active") {
            return { status: 403, error: "account_suspended" };
        }
        store_1.db.mutate((draft) => {
            draft.users = draft.users.map((u) => u.id === user.id
                ? {
                    ...u,
                    googleSub: u.googleSub ?? profile.sub,
                    name: u.name?.trim() ? u.name : profile.name,
                    lastSeenAtMs: now,
                }
                : u);
            draft.auditLog.unshift({
                id: `audit_${Date.now()}_${crypto_1.default.randomBytes(2).toString("hex")}`,
                actor: `user:${user.id}`,
                action: "login_google",
                target: user.id,
                atMs: Date.now(),
                meta: { email: user.email },
            });
        });
        user = store_1.db.read().users.find((u) => u.id === user.id);
    }
    if (!user) {
        return { status: 500, error: "user_create_failed" };
    }
    return {
        token: (0, app_user_jwt_1.signUserJwt)(user.id, user.email),
        user: { id: user.id, email: user.email, name: user.name },
    };
}
function appDeepLinkFromSession(session) {
    const q = new URLSearchParams({
        token: session.token,
        userId: session.user.id,
        email: session.user.email,
        name: session.user.name,
    });
    return `myframe://auth/google#${q.toString()}`;
}
