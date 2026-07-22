import crypto from "crypto";
import express from "express";

import { db } from "../db/store";
import { signUserJwt } from "../services/app_user_jwt";

export const wechatMobileAuthRouter = express.Router();
wechatMobileAuthRouter.use(express.json({ limit: "256kb" }));

function env(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function wechatConfig(): { appid: string; secret: string } | null {
  const appid = env("WECHAT_APPID") || env("WECHAT_MOBILE_APPID") || env("WECHAT_MINI_APPID");
  const secret = env("WECHAT_APPSECRET") || env("WECHAT_MOBILE_APPSECRET") || env("WECHAT_MINI_APPSECRET");
  if (!appid || !secret) return null;
  return { appid, secret };
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  return (await response.json()) as Record<string, unknown>;
}

async function exchangeCode(
  code: string,
  appid: string,
  secret: string,
): Promise<{ access_token: string; openid: string; unionid?: string }> {
  const url = new URL("https://api.weixin.qq.com/sns/oauth2/access_token");
  url.searchParams.set("appid", appid);
  url.searchParams.set("secret", secret);
  url.searchParams.set("code", code);
  url.searchParams.set("grant_type", "authorization_code");
  const data = await fetchJson(url.toString());
  if (data.errcode || !data.access_token || !data.openid) {
    throw new Error(
      `wechat_code_exchange_failed:${data.errcode ?? "missing_token"}:${data.errmsg ?? ""}`,
    );
  }
  return data as { access_token: string; openid: string; unionid?: string };
}

async function fetchWeChatUserInfo(
  accessToken: string,
  openid: string,
): Promise<{ openid: string; unionid?: string; nickname?: string }> {
  const url = new URL("https://api.weixin.qq.com/sns/userinfo");
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("openid", openid);
  url.searchParams.set("lang", "en");
  const data = await fetchJson(url.toString());
  if (data.errcode) return { openid };
  return data as { openid: string; unionid?: string; nickname?: string };
}

function fallbackEmail(openid: string): string {
  const hash = crypto.createHash("sha256").update(openid).digest("hex").slice(0, 24);
  return `wechat_${hash}@wechat.myframe.local`;
}

function completeWeChatLogin(profile: {
  openid: string;
  unionid?: string;
  nickname?: string;
}): { token: string; user: { id: string; email: string; name: string } } {
  const now = Date.now();
  const email = fallbackEmail(profile.unionid || profile.openid);
  const name = String(profile.nickname ?? "").trim() || "WeChat User";
  const data = db.read();
  let user =
    data.users.find((u) => profile.unionid && u.wechatUnionId === profile.unionid) ??
    data.users.find((u) => u.wechatOpenId === profile.openid) ??
    data.users.find((u) => u.email.toLowerCase() === email);

  if (!user) {
    const id = `usr_wx_${now}_${crypto.randomBytes(4).toString("hex")}`;
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
        createdAtMs: now,
        lastSeenAtMs: now,
        wechatOpenId: profile.openid,
        wechatUnionId: profile.unionid,
      });
      draft.auditLog.unshift({
        id: `audit_${now}_${crypto.randomBytes(2).toString("hex")}`,
        actor: `user:${id}`,
        action: "register_wechat",
        target: id,
        atMs: now,
        meta: { unionid: profile.unionid ?? null },
      });
    });
    user = db.read().users.find((u) => u.id === id);
  } else {
    if (user.status !== "active") {
      throw new Error("account_suspended");
    }
    db.mutate((draft) => {
      draft.users = draft.users.map((u) =>
        u.id === user!.id
          ? {
              ...u,
              name: u.name?.trim() ? u.name : name,
              lastSeenAtMs: now,
              wechatOpenId: u.wechatOpenId ?? profile.openid,
              wechatUnionId: u.wechatUnionId ?? profile.unionid,
            }
          : u,
      );
      draft.auditLog.unshift({
        id: `audit_${now}_${crypto.randomBytes(2).toString("hex")}`,
        actor: `user:${user!.id}`,
        action: "login_wechat",
        target: user!.id,
        atMs: now,
        meta: { unionid: profile.unionid ?? null },
      });
    });
    user = db.read().users.find((u) => u.id === user!.id);
  }

  if (!user) throw new Error("wechat_user_create_failed");
  return {
    token: signUserJwt(user.id, user.email),
    user: { id: user.id, email: user.email, name: user.name },
  };
}

async function handleWeChatLogin(req: express.Request, res: express.Response): Promise<void> {
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
      unionid: (info.unionid || token.unionid) as string | undefined,
      nickname: info.nickname,
    });
    res.json({ ok: true, ...payload });
  } catch (err) {
    if (err instanceof Error && err.message === "account_suspended") {
      res.status(403).json({ ok: false, error: "account_suspended" });
      return;
    }
    console.error("[wechat-mobile-auth] failed", err);
    res.status(502).json({ ok: false, error: "wechat_auth_failed" });
  }
}

wechatMobileAuthRouter.post("/auth/wechat", (req, res) => void handleWeChatLogin(req, res));
wechatMobileAuthRouter.post("/auth/wechat/login", (req, res) => void handleWeChatLogin(req, res));
