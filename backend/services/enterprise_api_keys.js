"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateEnterpriseApiKey = authenticateEnterpriseApiKey;
exports.hasScope = hasScope;
exports.generateEnterpriseApiKey = generateEnterpriseApiKey;
exports.hashApiSecret = hashApiSecret;
const crypto_1 = __importDefault(require("crypto"));
const store_1 = require("../db/store");
function sha256(text) {
    return crypto_1.default.createHash("sha256").update(text).digest("hex");
}
function readBearer(req) {
    const raw = String(req.header("authorization") ?? "").trim();
    const m = raw.match(/^Bearer\s+(.+)$/i);
    const tok = (m?.[1] ?? "").trim();
    return tok || null;
}
function readApiKey(req) {
    const direct = String(req.header("x-api-key") ?? "").trim();
    if (direct)
        return direct;
    return readBearer(req);
}
function secureEqualHex(aHex, bHex) {
    try {
        const a = Buffer.from(aHex, "hex");
        const b = Buffer.from(bHex, "hex");
        if (a.length !== b.length || a.length === 0)
            return false;
        return crypto_1.default.timingSafeEqual(a, b);
    }
    catch {
        return false;
    }
}
function authenticateEnterpriseApiKey(req) {
    const token = readApiKey(req);
    if (!token)
        return null;
    const dot = token.indexOf(".");
    if (dot <= 0 || dot === token.length - 1)
        return null;
    const keyId = token.slice(0, dot).trim();
    const secret = token.slice(dot + 1).trim();
    if (!keyId || !secret)
        return null;
    const data = store_1.db.read();
    const key = data.enterpriseApiKeys.find((k) => k.id === keyId);
    if (!key)
        return null;
    if (key.revokedAtMs != null)
        return null;
    if (key.expiresAtMs != null && Date.now() > key.expiresAtMs)
        return null;
    const secretHash = sha256(secret);
    if (!secureEqualHex(secretHash, key.secretHash))
        return null;
    store_1.db.mutate((draft) => {
        draft.enterpriseApiKeys = draft.enterpriseApiKeys.map((k) => k.id === keyId ? { ...k, lastUsedAtMs: Date.now() } : k);
    });
    return { orgId: key.orgId, keyId: key.id, scopes: key.scopes };
}
function hasScope(principal, scope) {
    return principal.scopes.includes(scope);
}
function generateEnterpriseApiKey() {
    const keyId = `mk_live_${crypto_1.default.randomBytes(6).toString("hex")}`;
    const keySecret = crypto_1.default.randomBytes(24).toString("hex");
    return { keyId, keySecret, token: `${keyId}.${keySecret}` };
}
function hashApiSecret(secret) {
    return sha256(secret);
}
