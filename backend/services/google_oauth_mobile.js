"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleOAuthClientSecret = googleOAuthClientSecret;
exports.primaryGoogleClientId = primaryGoogleClientId;
exports.isGoogleOAuthRedirectConfigured = isGoogleOAuthRedirectConfigured;
exports.publicApiBaseUrl = publicApiBaseUrl;
exports.googleOAuthRedirectUri = googleOAuthRedirectUri;
exports.buildGoogleOAuthAuthorizeUrl = buildGoogleOAuthAuthorizeUrl;
exports.exchangeGoogleOAuthCode = exchangeGoogleOAuthCode;
exports.googleConsoleSetupLines = googleConsoleSetupLines;
const google_auth_library_1 = require("google-auth-library");
const google_id_token_1 = require("./google_id_token");
const google_auth_session_1 = require("./google_auth_session");
const OAUTH_CALLBACK_PATH = "/mobile/google-oauth-callback";
const SCOPES = ["openid", "email", "profile"];
function googleOAuthClientSecret() {
    return (process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ||
        process.env.GOOGLE_CLIENT_SECRET?.trim() ||
        "");
}
function primaryGoogleClientId() {
    return (0, google_id_token_1.googleOAuthClientIds)()[0] ?? "";
}
function isGoogleOAuthRedirectConfigured() {
    return (0, google_id_token_1.isGoogleAuthConfigured)() && primaryGoogleClientId().length > 0 && googleOAuthClientSecret().length > 0;
}
/** Public API origin used in OAuth redirect_uri (must match Google Console exactly). */
function publicApiBaseUrl(req) {
    const fromEnv = process.env.PUBLIC_BASE_URL?.trim();
    if (fromEnv)
        return fromEnv.replace(/\/+$/, "");
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
function googleOAuthRedirectUri(req) {
    return `${publicApiBaseUrl(req)}${OAUTH_CALLBACK_PATH}`;
}
function buildGoogleOAuthAuthorizeUrl(req) {
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
async function exchangeGoogleOAuthCode(code, req) {
    if (!isGoogleOAuthRedirectConfigured()) {
        return { ok: false, status: 503, error: "google_oauth_not_configured" };
    }
    const clientId = primaryGoogleClientId();
    const clientSecret = googleOAuthClientSecret();
    const redirectUri = googleOAuthRedirectUri(req);
    const client = new google_auth_library_1.OAuth2Client(clientId, clientSecret, redirectUri);
    let idToken;
    try {
        const { tokens } = await client.getToken({ code, redirect_uri: redirectUri });
        idToken = tokens.id_token ?? undefined;
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, status: 401, error: "oauth_exchange_failed", message: msg };
    }
    if (!idToken) {
        return { ok: false, status: 401, error: "missing_id_token" };
    }
    const profile = await (0, google_id_token_1.verifyGoogleIdToken)(idToken);
    if (!profile) {
        return { ok: false, status: 401, error: "invalid_token" };
    }
    const session = (0, google_auth_session_1.completeGoogleLogin)(profile);
    if ("error" in session) {
        return { ok: false, status: session.status, error: session.error };
    }
    return { ok: true, deepLink: (0, google_auth_session_1.appDeepLinkFromSession)(session) };
}
function googleConsoleSetupLines(req) {
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
