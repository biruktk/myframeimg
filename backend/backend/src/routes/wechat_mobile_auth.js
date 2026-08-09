"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.wechatMobileAuthRouter = void 0;
const crypto_1 = __importDefault(require("crypto"));
const express_1 = __importDefault(require("express"));
const store_1 = require("../db/store");
const app_user_jwt_1 = require("../services/app_user_jwt");
exports.wechatMobileAuthRouter = express_1.default.Router();
exports.wechatMobileAuthRouter.use(express_1.default.json({ limit: "256kb" }));
function env(name) {
    return String(process.env[name] ?? "").trim();
}
function wechatConfig() {
    const appid = env("WECHAT_APPID") || env("WECHAT_MOBILE_APPID") || env("WECHAT_MINI_APPID");
    const secret = env("WECHAT_APPSECRET") || env("WECHAT_MOBILE_APPSECRET") || env("WECHAT_MINI_APPSECRET");
    if (!appid || !secret)
        return null;
    return { appid, secret };
}
async function fetchJson(url) {
    const response = await fetch(url, { headers: { accept: "application/json" } });
    return (await response.json());
}
async function exchangeCode(code, appid, secret) {
    const url = new URL("https://api.weixin.qq.com/sns/oauth2/access_token");
    url.searchParams.set("appid", appid);
    url.searchParams.set("secret", secret);
    url.searchParams.set("code", code);
    url.searchParams.set("grant_type", "authorization_code");
    const data = await fetchJson(url.toString());
    if (data.errcode || !data.access_token || !data.openid) {
        throw new Error(`wechat_code_exchange_failed:${data.errcode ?? "missing_token"}:${data.errmsg ?? ""}`);
    }
    return data;
}
async function fetchWeChatUserInfo(accessToken, openid) {
    const url = new URL("https://api.weixin.qq.com/sns/userinfo");
    url.searchParams.set("access_token", accessToken);
    url.searchParams.set("openid", openid);
    url.searchParams.set("lang", "en");
    const data = await fetchJson(url.toString());
    if (data.errcode)
        return { openid };
    return data;
}
function fallbackEmail(openid) {
    const hash = crypto_1.default.createHash("sha256").update(openid).digest("hex").slice(0, 24);
    return `wechat_${hash}@wechat.myframe.local`;
}
function completeWeChatLogin(profile) {
    const now = Date.now();
    const email = fallbackEmail(profile.unionid || profile.openid);
    const name = String(profile.nickname ?? "").trim() || "WeChat User";
    const data = store_1.db.read();
    let user = data.users.find((u) => profile.unionid && u.wechatUnionId === profile.unionid) ??
        data.users.find((u) => u.wechatOpenId === profile.openid) ??
        data.users.find((u) => u.email.toLowerCase() === email);
    if (!user) {
        const id = `usr_wx_${now}_${crypto_1.default.randomBytes(4).toString("hex")}`;
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
                wechatOpenId: profile.openid,
                wechatUnionId: profile.unionid,
            });
            draft.auditLog.unshift({
                id: `audit_${now}_${crypto_1.default.randomBytes(2).toString("hex")}`,
                actor: `user:${id}`,
                action: "register_wechat",
                target: id,
                atMs: now,
                meta: { unionid: profile.unionid ?? null },
            });
        });
        user = store_1.db.read().users.find((u) => u.id === id);
    }
    else {
        if (user.status !== "active") {
            throw new Error("account_suspended");
        }
        store_1.db.mutate((draft) => {
            draft.users = draft.users.map((u) => u.id === user.id
                ? {
                    ...u,
                    name: u.name?.trim() ? u.name : name,
                    lastSeenAtMs: now,
                    wechatOpenId: u.wechatOpenId ?? profile.openid,
                    wechatUnionId: u.wechatUnionId ?? profile.unionid,
                }
                : u);
            draft.auditLog.unshift({
                id: `audit_${now}_${crypto_1.default.randomBytes(2).toString("hex")}`,
                actor: `user:${user.id}`,
                action: "login_wechat",
                target: user.id,
                atMs: now,
                meta: { unionid: profile.unionid ?? null },
            });
        });
        user = store_1.db.read().users.find((u) => u.id === user.id);
    }
    if (!user)
        throw new Error("wechat_user_create_failed");
    return {
        token: (0, app_user_jwt_1.signUserJwt)(user.id, user.email),
        user: { id: user.id, email: user.email, name: user.name },
    };
}
async function handleWeChatLogin(req, res) {
    try {
        const config = wechatConfig();
        if (!config) {
            res.status(503).json({ ok: false, error: "wechat_config_missing" });
            return;
        }
        const code = String(req.body?.code ?? "").trim();
        if (!code) {
            res.status(400).json({ ok: false, error: "missing_wechat_code" });
            return;
        }
        const token = await exchangeCode(code, config.appid, config.secret);
        const info = await fetchWeChatUserInfo(token.access_token, token.openid);
        const payload = completeWeChatLogin({
            openid: token.openid,
            unionid: (info.unionid || token.unionid),
            nickname: info.nickname,
        });
        res.json({ ok: true, ...payload });
    }
    catch (err) {
        if (err instanceof Error && err.message === "account_suspended") {
            res.status(403).json({ ok: false, error: "account_suspended" });
            return;
        }
        console.error("[wechat-mobile-auth] failed", err);
        res.status(502).json({ ok: false, error: "wechat_auth_failed" });
    }
}
exports.wechatMobileAuthRouter.post("/auth/wechat", (req, res) => void handleWeChatLogin(req, res));
exports.wechatMobileAuthRouter.post("/auth/wechat/login", (req, res) => void handleWeChatLogin(req, res));
