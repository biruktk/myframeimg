import crypto from "crypto";
import express, { Router } from "express";

import { db } from "../db/store";
import { signUserJwt } from "../services/app_user_jwt";

export const wechatPhoneRouter = Router();
wechatPhoneRouter.use(express.json({ limit: "256kb" }));

function wechatAppId(): string {
  return String(process.env.WECHAT_MINI_APPID ?? "").trim();
}

function wechatAppSecret(): string {
  return String(process.env.WECHAT_MINI_APPSECRET ?? "").trim();
}

function wechatConfigured(): boolean {
  return Boolean(wechatAppId() && wechatAppSecret());
}

type WxSession = { openid?: string; session_key?: string; unionid?: string; errcode?: number; errmsg?: string };

async function jscode2session(code: string): Promise<WxSession | null> {
  const appid = wechatAppId();
  const secret = wechatAppSecret();
  const url =
    `https://api.weixin.qq.com/sns/jscode2session` +
    `?appid=${encodeURIComponent(appid)}` +
    `&secret=${encodeURIComponent(secret)}` +
    `&js_code=${encodeURIComponent(code)}` +
    `&grant_type=authorization_code`;
  const res = await fetch(url);
  const data = (await res.json()) as WxSession;
  if (!data.openid || data.errcode) return null;
  return data;
}

let cachedAccessToken: { token: string; expiresAtMs: number } | null = null;

async function getMiniProgramAccessToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedAccessToken && now < cachedAccessToken.expiresAtMs - 60_000) {
    return cachedAccessToken.token;
  }
  const appid = wechatAppId();
  const secret = wechatAppSecret();
  const url =
    `https://api.weixin.qq.com/cgi-bin/token` +
    `?grant_type=client_credential&appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}`;
  const res = await fetch(url);
  const data = (await res.json()) as { access_token?: string; expires_in?: number; errcode?: number };
  if (!data.access_token) return null;
  cachedAccessToken = {
    token: data.access_token,
    expiresAtMs: now + (Number(data.expires_in ?? 7200) * 1000),
  };
  return data.access_token;
}

/** POST /api/auth/wechat/login — Mini Program `wx.login` code → app JWT */
wechatPhoneRouter.post("/auth/wechat/login", async (req, res) => {
  if (!wechatConfigured()) {
    res.status(503).json({ ok: false, error: "wechat_not_configured" });
    return;
  }
  const code = String(req.body?.code ?? "").trim();
  if (!code) {
    res.status(400).json({ ok: false, error: "code_required" });
    return;
  }

  const session = await jscode2session(code);
  if (!session?.openid) {
    res.status(401).json({ ok: false, error: "wechat_code_invalid" });
    return;
  }

  const openid = session.openid;
  const data = db.read();
  let user = data.users.find((u) => (u as { wechatOpenId?: string }).wechatOpenId === openid);

  const now = Date.now();
  if (!user) {
    const id = `usr_${now}_${crypto.randomBytes(4).toString("hex")}`;
    const pseudoEmail = `wx_${openid.slice(0, 12)}@wechat.myframe.local`;
    db.mutate((draft) => {
      const fallbackOrgId = draft.organizations[0]?.id ?? "org_default";
      draft.users.push({
        id,
        email: pseudoEmail,
        name: "WeChat User",
        orgId: fallbackOrgId,
        subscriptionTier: "free",
        familyGroupId: null,
        status: "active",
        createdAtMs: now,
        lastSeenAtMs: now,
        wechatOpenId: openid,
        wechatUnionId: session.unionid ?? undefined,
      } as (typeof draft.users)[number]);
    });
    user = db.read().users.find((u) => u.id === id);
  } else {
    db.mutate((draft) => {
      draft.users = draft.users.map((u) =>
        u.id === user!.id ? { ...u, lastSeenAtMs: now } : u,
      );
    });
    user = db.read().users.find((u) => u.id === user!.id);
  }

  if (!user) {
    res.status(500).json({ ok: false, error: "user_create_failed" });
    return;
  }

  const token = signUserJwt(user.id, user.email);
  res.json({
    ok: true,
    token,
    user: { id: user.id, email: user.email, name: user.name },
    wechat: { openid },
  });
});

/**
 * POST /api/auth/wechat/phone — bind phone from Mini Program `getPhoneNumber` code.
 * Body: `{ loginCode, phoneCode }` or `{ code, phoneCode }` (loginCode = wx.login).
 */
wechatPhoneRouter.post("/auth/wechat/phone", async (req, res) => {
  if (!wechatConfigured()) {
    res.status(503).json({ ok: false, error: "wechat_not_configured" });
    return;
  }

  const loginCode = String(req.body?.loginCode ?? req.body?.code ?? "").trim();
  const phoneCode = String(req.body?.phoneCode ?? req.body?.phone_code ?? "").trim();
  if (!loginCode || !phoneCode) {
    res.status(400).json({ ok: false, error: "login_and_phone_code_required" });
    return;
  }

  const session = await jscode2session(loginCode);
  if (!session?.openid) {
    res.status(401).json({ ok: false, error: "wechat_code_invalid" });
    return;
  }

  const accessToken = await getMiniProgramAccessToken();
  if (!accessToken) {
    res.status(503).json({ ok: false, error: "wechat_token_unavailable" });
    return;
  }

  const phoneRes = await fetch(
    `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: phoneCode }),
    },
  );
  const phoneData = (await phoneRes.json()) as {
    errcode?: number;
    phone_info?: { phoneNumber?: string; purePhoneNumber?: string; countryCode?: string };
  };
  if (phoneData.errcode || !phoneData.phone_info?.phoneNumber) {
    res.status(401).json({ ok: false, error: "wechat_phone_invalid" });
    return;
  }

  const phone = String(phoneData.phone_info.purePhoneNumber ?? phoneData.phone_info.phoneNumber).trim();
  const openid = session.openid;
  const data = db.read();
  let user = data.users.find((u) => (u as { wechatOpenId?: string }).wechatOpenId === openid);
  const now = Date.now();

  if (!user) {
    const id = `usr_${now}_${crypto.randomBytes(4).toString("hex")}`;
    const email = `wx_${openid.slice(0, 8)}@wechat.myframe.local`;
    db.mutate((draft) => {
      const fallbackOrgId = draft.organizations[0]?.id ?? "org_default";
      draft.users.push({
        id,
        email,
        name: phone,
        orgId: fallbackOrgId,
        subscriptionTier: "free",
        familyGroupId: null,
        status: "active",
        createdAtMs: now,
        lastSeenAtMs: now,
        wechatOpenId: openid,
        wechatUnionId: session.unionid ?? undefined,
        phone,
      } as (typeof draft.users)[number]);
    });
    user = db.read().users.find((u) => u.id === id);
  } else {
    db.mutate((draft) => {
      draft.users = draft.users.map((u) =>
        u.id === user!.id
          ? ({ ...u, phone, lastSeenAtMs: now, name: u.name?.trim() ? u.name : phone } as typeof u)
          : u,
      );
    });
    user = db.read().users.find((u) => u.id === user!.id);
  }

  if (!user) {
    res.status(500).json({ ok: false, error: "user_create_failed" });
    return;
  }

  const token = signUserJwt(user.id, user.email);
  res.json({
    ok: true,
    token,
    user: { id: user.id, email: user.email, name: user.name, phone },
    wechat: { openid },
  });
});
