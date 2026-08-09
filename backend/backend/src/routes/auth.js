"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const crypto_1 = __importDefault(require("crypto"));
const express_1 = __importStar(require("express"));
const store_1 = require("../db/store");
const app_user_jwt_1 = require("../services/app_user_jwt");
const google_auth_post_1 = require("../handlers/google_auth_post");
const apple_auth_post_1 = require("../handlers/apple_auth_post");
exports.authRouter = (0, express_1.Router)();
const TEST_USER_EMAIL = "test@myframe.local";
const TEST_USER_NAME = "Test User";
const TEST_USER_PASSWORD = "test-login-no-credentials";
function hashPassword(password, saltHex) {
    const salt = Buffer.from(saltHex, "hex");
    return crypto_1.default.scryptSync(password.normalize("NFKC"), salt, 64).toString("hex");
}
function hashNewPassword(password) {
    const salt = crypto_1.default.randomBytes(16);
    const saltHex = salt.toString("hex");
    const hashHex = hashPassword(password, saltHex);
    return { saltHex, hashHex };
}
function issueToken(userId, email) {
    return (0, app_user_jwt_1.signUserJwt)(userId, email);
}
function normalizeEmail(email) {
    return String(email ?? "").trim().toLowerCase();
}
exports.authRouter.use(express_1.default.json({ limit: "256kb" }));
exports.authRouter.post("/auth/register", (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password ?? "");
    const name = String(req.body?.name ?? "").trim();
    if (!email || email.length > 254 || !email.includes("@")) {
        res.status(400).json({ ok: false, error: "invalid_email" });
        return;
    }
    if (password.length < 6 || password.length > 256) {
        res.status(400).json({ ok: false, error: "password_length" });
        return;
    }
    if (!name || name.length > 128) {
        res.status(400).json({ ok: false, error: "invalid_name" });
        return;
    }
    const data = store_1.db.read();
    if (data.users.some((u) => u.email.toLowerCase() === email)) {
        res.status(409).json({ ok: false, error: "email_taken" });
        return;
    }
    const now = Date.now();
    const { saltHex, hashHex } = hashNewPassword(password);
    const id = `usr_${now}_${crypto_1.default.randomBytes(4).toString("hex")}`;
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
            createdAtMs: now,
            lastSeenAtMs: now,
            passwordSalt: saltHex,
            passwordHash: hashHex,
        });
        draft.settings.account.name = draft.settings.account.name || name;
        draft.settings.account.email = draft.settings.account.email || email;
        draft.auditLog.unshift({
            id: `audit_${Date.now()}_${crypto_1.default.randomBytes(2).toString("hex")}`,
            actor: `user:${id}`,
            action: "register",
            target: id,
            atMs: Date.now(),
            meta: { email },
        });
    });
    const token = issueToken(id, email);
    res.status(201).json({
        ok: true,
        token,
        user: { id, email, name },
    });
});
exports.authRouter.post("/auth/login", (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password ?? "");
    if (!email || !password) {
        res.status(400).json({ ok: false, error: "invalid_credentials" });
        return;
    }
    const data = store_1.db.read();
    const user = data.users.find((u) => u.email.toLowerCase() === email);
    if (!user?.passwordSalt || !user.passwordHash) {
        res.status(401).json({ ok: false, error: "invalid_credentials" });
        return;
    }
    const attempt = hashPassword(password, user.passwordSalt);
    const aBuf = Buffer.from(attempt, "hex");
    const stored = Buffer.from(user.passwordHash, "hex");
    if (aBuf.length !== stored.length || !crypto_1.default.timingSafeEqual(aBuf, stored)) {
        res.status(401).json({ ok: false, error: "invalid_credentials" });
        return;
    }
    if (user.status !== "active") {
        res.status(403).json({ ok: false, error: "account_suspended" });
        return;
    }
    store_1.db.mutate((draft) => {
        draft.users = draft.users.map((u) => (u.id === user.id ? { ...u, lastSeenAtMs: Date.now() } : u));
        draft.auditLog.unshift({
            id: `audit_${Date.now()}_${crypto_1.default.randomBytes(2).toString("hex")}`,
            actor: `user:${user.id}`,
            action: "login",
            target: user.id,
            atMs: Date.now(),
            meta: { email: user.email },
        });
    });
    const token = issueToken(user.id, user.email);
    res.json({
        ok: true,
        token,
        user: { id: user.id, email: user.email, name: user.name },
    });
});
exports.authRouter.post("/auth/test-login", (_req, res) => {
    const now = Date.now();
    const data = store_1.db.read();
    let user = data.users.find((u) => u.email.toLowerCase() === TEST_USER_EMAIL);
    if (!user) {
        const { saltHex, hashHex } = hashNewPassword(TEST_USER_PASSWORD);
        const id = `usr_test_${crypto_1.default.randomBytes(4).toString("hex")}`;
        store_1.db.mutate((draft) => {
            const fallbackOrgId = draft.organizations[0]?.id ?? "org_default";
            draft.users.push({
                id,
                email: TEST_USER_EMAIL,
                name: TEST_USER_NAME,
                orgId: fallbackOrgId,
                subscriptionTier: "pro",
                familyGroupId: null,
                status: "active",
                createdAtMs: now,
                lastSeenAtMs: now,
                passwordSalt: saltHex,
                passwordHash: hashHex,
            });
        });
        user = store_1.db.read().users.find((u) => u.id === id);
    }
    else {
        store_1.db.mutate((draft) => {
            draft.users = draft.users.map((u) => (u.id === user.id ? { ...u, lastSeenAtMs: now } : u));
            draft.auditLog.unshift({
                id: `audit_${Date.now()}_${crypto_1.default.randomBytes(2).toString("hex")}`,
                actor: `user:${user.id}`,
                action: "test_login",
                target: user.id,
                atMs: Date.now(),
                meta: { email: user.email },
            });
        });
    }
    if (!user) {
        res.status(500).json({ ok: false, error: "test_user_create_failed" });
        return;
    }
    // Ensure test user can use the portal (family + demo frame).
    store_1.db.mutate((draft) => {
        const u = draft.users.find((x) => x.id === user.id);
        if (!u)
            return;
        let group = u.familyGroupId ? draft.familyGroups.find((g) => g.id === u.familyGroupId) : undefined;
        if (!group) {
            const gid = `fam_test_${crypto_1.default.randomBytes(2).toString("hex")}`;
            group = {
                id: gid,
                name: "Test Family",
                inviteCode: `TEST-${crypto_1.default.randomBytes(2).toString("hex").toUpperCase()}`,
                members: [{ userId: u.id, role: "owner" }],
                frameIds: ["YX-133P-001"],
            };
            draft.familyGroups.push(group);
            u.familyGroupId = gid;
        }
        if (!group.frameIds.includes("YX-133P-001")) {
            group.frameIds.push("YX-133P-001");
        }
        let frame = draft.frames.find((f) => f.id === "YX-133P-001");
        if (!frame) {
            frame = {
                id: "YX-133P-001",
                bleMac: "D0:CF:13:F0:16:1E",
                ownerUserId: u.id,
                orgId: u.orgId,
                wifiSsid: null,
                wifiStatus: "never_provisioned",
                firmwareVersion: "1.2.0",
                lastSeenAtMs: null,
                uptimeMs: 0,
                photoQueueDepth: 0,
                ota: { targetVersion: null, status: "idle" },
            };
            draft.frames.push(frame);
        }
        else {
            frame.ownerUserId = u.id;
        }
    });
    user = store_1.db.read().users.find((u) => u.id === user.id) ?? user;
    const token = issueToken(user.id, user.email);
    res.json({
        ok: true,
        token,
        user: { id: user.id, email: user.email, name: user.name },
        mode: "test",
    });
});
exports.authRouter.post("/auth/google", (req, res) => void (0, google_auth_post_1.handleGoogleAuthPost)(req, res));
exports.authRouter.post("/auth/apple", (req, res) => void (0, apple_auth_post_1.handleAppleAuthPost)(req, res));
exports.authRouter.get("/auth/session", (req, res) => {
    const authed = (0, app_user_jwt_1.verifyUserJwtBearer)(req);
    if (!authed) {
        res.status(401).json({ ok: false });
        return;
    }
    const user = store_1.db.read().users.find((u) => u.id === authed.userId);
    if (!user || user.status !== "active") {
        res.status(401).json({ ok: false });
        return;
    }
    res.json({
        ok: true,
        user: { id: user.id, email: user.email, name: user.name },
    });
});
