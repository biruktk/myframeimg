"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.appleClientIds = appleClientIds;
exports.isAppleAuthConfigured = isAppleAuthConfigured;
exports.verifyAppleIdentityToken = verifyAppleIdentityToken;
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
let jwksCache = null;
const JWKS_TTL_MS = 60 * 60 * 1000;
/** Comma-separated iOS bundle IDs (default: com.myframe.minyuex). */
function appleClientIds() {
    const raw = process.env.APPLE_CLIENT_IDS?.trim() ||
        process.env.APPLE_BUNDLE_ID?.trim() ||
        "com.myframe.minyuex";
    return raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}
function isAppleAuthConfigured() {
    return appleClientIds().length > 0;
}
async function getAppleJwks() {
    const now = Date.now();
    if (jwksCache && now - jwksCache.fetchedAt < JWKS_TTL_MS) {
        return jwksCache.keys;
    }
    const response = await fetch("https://appleid.apple.com/auth/keys");
    const data = (await response.json());
    const keys = (data.keys ?? []).filter((k) => k.kid && k.kty === "RSA");
    jwksCache = { keys, fetchedAt: now };
    return keys;
}
function pemFromJwk(jwk) {
    const keyObject = crypto_1.default.createPublicKey({ key: jwk, format: "jwk" });
    return keyObject.export({ type: "spki", format: "pem" });
}
async function verifyAppleIdentityToken(identityToken) {
    const audiences = appleClientIds();
    if (!audiences.length) {
        throw new Error("apple_auth_not_configured");
    }
    const decoded = jsonwebtoken_1.default.decode(identityToken.trim(), { complete: true });
    if (!decoded || typeof decoded === "string")
        return null;
    const kid = decoded.header?.kid;
    if (!kid)
        return null;
    const keys = await getAppleJwks();
    const jwk = keys.find((k) => k.kid === kid);
    if (!jwk)
        return null;
    const pem = pemFromJwk(jwk);
    try {
        let payload = null;
        for (const aud of audiences) {
            try {
                payload = jsonwebtoken_1.default.verify(identityToken.trim(), pem, {
                    algorithms: ["RS256"],
                    issuer: "https://appleid.apple.com",
                    audience: aud,
                });
                break;
            }
            catch {
                /* try next bundle id */
            }
        }
        if (!payload)
            return null;
        const sub = String(payload.sub ?? "").trim();
        if (!sub)
            return null;
        const rawEmail = String(payload.email ?? "").trim().toLowerCase();
        const email = rawEmail && rawEmail.includes("@") ? rawEmail : undefined;
        return { sub, email };
    }
    catch {
        return null;
    }
}
