"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.completeAppleLogin = completeAppleLogin;
const crypto_1 = __importDefault(require("crypto"));
const store_1 = require("../db/store");
const app_user_jwt_1 = require("../services/app_user_jwt");
function fallbackEmail(sub) {
    const hash = crypto_1.default.createHash("sha256").update(sub).digest("hex").slice(0, 24);
    return `apple_${hash}@apple.myframe.local`;
}
function completeAppleLogin(profile, hints) {
    const now = Date.now();
    const email = (profile.email || hints?.email || "").trim().toLowerCase() || fallbackEmail(profile.sub);
    const hintedName = String(hints?.name ?? "").trim();
    const name = hintedName || "Apple User";
    const data = store_1.db.read();
    let user = data.users.find((u) => u.appleSub === profile.sub) ??
        (email.includes("@") ? data.users.find((u) => u.email.toLowerCase() === email) : undefined);
    if (!user) {
        const id = `usr_apple_${now}_${crypto_1.default.randomBytes(4).toString("hex")}`;
        store_1.db.mutate((draft) => {
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
                id: `audit_${Date.now()}_${crypto_1.default.randomBytes(2).toString("hex")}`,
                actor: `user:${id}`,
                action: "register_apple",
                target: id,
                atMs: Date.now(),
                meta: { email },
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
                    appleSub: u.appleSub ?? profile.sub,
                    name: u.name?.trim() ? u.name : hintedName || u.name,
                    lastSeenAtMs: now,
                }
                : u);
            draft.auditLog.unshift({
                id: `audit_${Date.now()}_${crypto_1.default.randomBytes(2).toString("hex")}`,
                actor: `user:${user.id}`,
                action: "login_apple",
                target: user.id,
                atMs: Date.now(),
                meta: { email: user.email },
            });
        });
        user = store_1.db.read().users.find((u) => u.id === user.id);
    }
    if (!user) {
        return { status: 500, error: "apple_user_create_failed" };
    }
    return {
        token: (0, app_user_jwt_1.signUserJwt)(user.id, user.email),
        user: { id: user.id, email: user.email, name: user.name },
    };
}
