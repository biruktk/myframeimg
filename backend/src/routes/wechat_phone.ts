import crypto from "crypto";
import express from "express";

import { db } from "../db/store";
import { signUserJwt } from "../services/app_user_jwt";

export const wechatPhoneRouter = express.Router();
wechatPhoneRouter.use(express.json({ limit: "256kb" }));

function env(name: string): string {
  return String(process.env[name] ?? "").trim();
}

function requireWechatConfig(): { appid: string; secret: string } | null {
  const appid = env("WECHAT_MINI_APPID") || env("WECHAT_APPID");
  const secret = env("WECHAT_MINI_APPSECRET") || env("WECHAT_APPSECRET");
  if (!appid || !secret) return null;
  return { appid, secret };
}

function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return phone;
  return digits.slice(0, 3) + "****" + digits.slice(-4);
}

async function fetchJson(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(url, init);
  return (await response.json()) as Record<string, unknown>;
}

async function getAccessToken(appid: string, secret: string): Promise<string> {
  const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
  url.searchParams.set("grant_type", "client_credential");
  url.searchParams.set("appid", appid);
  url.searchParams.set("secret", secret);
  const data = await fetchJson(url.toString());
  if (!data.access_token) {
    throw new Error(
      `wechat_access_token_failed:${data.errcode ?? "unknown"}:${data.errmsg ?? ""}`,
    );
  }
  return data.access_token as string;
}

async function getOpenId(
  appid: string,
  secret: string,
  loginCode: string,
): Promise<Record<string, unknown>> {
  if (!loginCode) return {};
  const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
  url.searchParams.set("appid", appid);
  url.searchParams.set("secret", secret);
  url.searchParams.set("js_code", loginCode);
  url.searchParams.set("grant_type", "authorization_code");
  const data = await fetchJson(url.toString());
  if (data.errcode) {
    throw new Error(
      `wechat_session_failed:${data.errcode}:${data.errmsg ?? ""}`,
    );
  }
  return data;
}

async function getPhoneNumber(
  accessToken: string,
  phoneCode: string,
): Promise<{ purePhoneNumber?: string; phoneNumber?: string }> {
  const url =
    `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(accessToken)}`;
  const data = await fetchJson(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: phoneCode }),
  });
  if (data.errcode && data.errcode !== 0) {
    throw new Error(
      `wechat_phone_failed:${data.errcode}:${data.errmsg ?? ""}`,
    );
  }
  if (!data.phone_info || (!(data.phone_info as Record<string, unknown>).purePhoneNumber && !(data.phone_info as Record<string, unknown>).phoneNumber)) {
    throw new Error("wechat_phone_missing");
  }
  return data.phone_info as { purePhoneNumber?: string; phoneNumber?: string };
}

function upsertWechatPhoneUser(
  phone: string,
  openid?: string,
): { id: string; email: string; name: string } {
  const normalizedPhone = phone.replace(/\D/g, "") || phone;
  const phoneHash = hash(normalizedPhone);
  const email = `wechat_${phoneHash.slice(0, 20)}@wechat.myframe.local`;
  const now = Date.now();
  const data = db.read();
  const existing = data.users.find((u) => u.email.toLowerCase() === email);

  if (existing) {
    db.mutate((draft) => {
      draft.users = draft.users.map((u) =>
        u.id === existing.id ? { ...u, lastSeenAtMs: now } : u,
      );
      draft.auditLog.unshift({
        id: `audit_${now}_${crypto.randomBytes(2).toString("hex")}`,
        actor: `user:${existing.id}`,
        action: "wechat_phone_login",
        target: existing.id,
        atMs: now,
        meta: { openid: openid ?? null },
      });
    });
    return { id: existing.id, email: existing.email, name: existing.name };
  }

  const id = `usr_wx_${phoneHash.slice(0, 12)}_${crypto.randomBytes(3).toString("hex")}`;
  const name = `WeChat ${maskPhone(normalizedPhone)}`;
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
    });
    draft.auditLog.unshift({
      id: `audit_${now}_${crypto.randomBytes(2).toString("hex")}`,
      actor: `user:${id}`,
      action: "wechat_phone_register",
      target: id,
      atMs: now,
      meta: { openid: openid ?? null },
    });
  });
  return { id, email, name };
}

wechatPhoneRouter.post("/wechat/phone-login", async (req, res) => {
  try {
    const config = requireWechatConfig();
    if (!config) {
      res.status(503).json({ ok: false, error: "wechat_config_missing" });
      return;
    }

    const loginCode = String(req.body?.loginCode ?? req.body?.code ?? "").trim();
    const phoneCode = String(req.body?.phoneCode ?? req.body?.phone_code ?? "").trim();

    if (!phoneCode) {
      res.status(400).json({ ok: false, error: "phone_code_required" });
      return;
    }

    const accessToken = await getAccessToken(config.appid, config.secret);
    const session = await getOpenId(config.appid, config.secret, loginCode);
    const phoneInfo = await getPhoneNumber(accessToken, phoneCode);
    const phone = String(phoneInfo?.purePhoneNumber || phoneInfo?.phoneNumber || "");
    const user = upsertWechatPhoneUser(phone, session.openid as string | undefined);
    const token = signUserJwt(user.id, user.email);

    res.json({
      ok: true,
      token,
      user: { id: user.id, name: user.name, phoneMasked: maskPhone(phone) },
    });
  } catch (err) {
    console.error("[wechat-phone-login] failed", err);
    res.status(502).json({ ok: false, error: "wechat_phone_login_failed" });
  }
});
