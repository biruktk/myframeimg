"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleOAuthClientIds = googleOAuthClientIds;
exports.isGoogleAuthConfigured = isGoogleAuthConfigured;
exports.verifyGoogleIdToken = verifyGoogleIdToken;
const google_auth_library_1 = require("google-auth-library");
/** Comma-separated OAuth client IDs (Web + Android + iOS) from Google Cloud Console. */
function googleOAuthClientIds() {
    const raw = process.env.GOOGLE_OAUTH_CLIENT_IDS?.trim() ||
        process.env.GOOGLE_CLIENT_ID?.trim() ||
        "";
    return raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}
function isGoogleAuthConfigured() {
    return googleOAuthClientIds().length > 0;
}
async function verifyGoogleIdToken(idToken) {
    const audiences = googleOAuthClientIds();
    if (!audiences.length) {
        throw new Error("google_auth_not_configured");
    }
    const client = new google_auth_library_1.OAuth2Client();
    try {
        const ticket = await client.verifyIdToken({
            idToken: idToken.trim(),
            audience: audiences,
        });
        const p = ticket.getPayload();
        if (!p?.sub)
            return null;
        const email = String(p.email ?? "")
            .trim()
            .toLowerCase();
        if (!email || !email.includes("@"))
            return null;
        const name = String(p.name ?? p.given_name ?? email.split("@")[0] ?? "User").trim();
        return {
            sub: p.sub,
            email,
            name: name || email.split("@")[0] || "User",
            emailVerified: p.email_verified === true,
        };
    }
    catch {
        return null;
    }
}
