import type { Request } from "express";
import { OAuth2Client } from "google-auth-library";

import { googleOAuthClientIds, isGoogleAuthConfigured, verifyGoogleIdToken } from "./google_id_token";
import { appDeepLinkFromSession, completeGoogleLogin } from "./google_auth_session";

const OAUTH_CALLBACK_PATH = "/mobile/google-oauth-callback";
const SCOPES = ["openid", "email", "profile"];

export function googleOAuthClientSecret(): string {
  return (
    process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ||
    process.env.GOOGLE_CLIENT_SECRET?.trim() ||
    ""
  );
}

export function primaryGoogleClientId(): string {
  return googleOAuthClientIds()[0] ?? "";
}

export function isGoogleOAuthRedirectConfigured(): boolean {
  return isGoogleAuthConfigured() && primaryGoogleClientId().length > 0 && googleOAuthClientSecret().length > 0;
}

/** Public API origin used in OAuth redirect_uri (must match Google Console exactly). */
export function publicApiBaseUrl(req?: Request): string {
  const fromEnv = process.env.PUBLIC_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  if (req) {
    const host = (req.get("x-forwarded-host") || req.get("host") || "").trim();
    if (host) {
      const proto = (req.get("x-forwarded-proto") || req.protocol || "http").split(",")[0].trim();
      return `${proto}://${host}`.replace(/\/+$/, "");
    }
  }
  const port = process.env.PORT || "3001";
  return `http://127.0.0.1:${port}`;
}

export function googleOAuthRedirectUri(req?: Request): string {
  return `${publicApiBaseUrl(req)}${OAUTH_CALLBACK_PATH}`;
}

export function buildGoogleOAuthAuthorizeUrl(req?: Request): string {
  const clientId = primaryGoogleClientId();
  const redirectUri = googleOAuthRedirectUri(req);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "online",
    prompt: "select_account",
    include_granted_scopes: "true",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleOAuthCode(
  code: string,
  req?: Request,
): Promise<
  | { ok: true; deepLink: string }
  | { ok: false; status: number; error: string; message?: string }
> {
  if (!isGoogleOAuthRedirectConfigured()) {
    return { ok: false, status: 503, error: "google_oauth_not_configured" };
  }

  const clientId = primaryGoogleClientId();
  const clientSecret = googleOAuthClientSecret();
  const redirectUri = googleOAuthRedirectUri(req);

  const client = new OAuth2Client(clientId, clientSecret, redirectUri);
  let idToken: string | undefined;
  try {
    const { tokens } = await client.getToken({ code, redirect_uri: redirectUri });
    idToken = tokens.id_token ?? undefined;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 401, error: "oauth_exchange_failed", message: msg };
  }

  if (!idToken) {
    return { ok: false, status: 401, error: "missing_id_token" };
  }

  const profile = await verifyGoogleIdToken(idToken);
  if (!profile) {
    return { ok: false, status: 401, error: "invalid_token" };
  }

  const session = completeGoogleLogin(profile);
  if ("error" in session) {
    return { ok: false, status: session.status, error: session.error };
  }

  return { ok: true, deepLink: appDeepLinkFromSession(session) };
}

export function googleConsoleSetupLines(req?: Request): string[] {
  const base = publicApiBaseUrl(req);
  const redirect = googleOAuthRedirectUri(req);
  const clientId = primaryGoogleClientId();
  return [
    `Web client ID: ${clientId || "(set GOOGLE_OAUTH_CLIENT_IDS)"}`,
    `Authorized redirect URI: ${redirect}`,
    `Authorized JavaScript origin (GIS fallback): ${base}`,
    `OAuth consent screen: add ${process.env.GOOGLE_TEST_USER_EMAIL || "your Gmail"} as a Test user if app is in Testing`,
    `Set GOOGLE_OAUTH_CLIENT_SECRET in backend/.env (from the Web client)`,
    `Set PUBLIC_BASE_URL=${base} on the VPS`,
  ];
}
