"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAppleAuthPost = handleAppleAuthPost;
const apple_auth_session_1 = require("../services/apple_auth_session");
const apple_id_token_1 = require("../services/apple_id_token");
/** POST body: identityToken (+ optional email, name from first Apple sign-in). */
async function handleAppleAuthPost(req, res) {
    if (!(0, apple_id_token_1.isAppleAuthConfigured)()) {
        res.status(503).json({ ok: false, error: "apple_auth_not_configured" });
        return;
    }
    const identityToken = String(req.body?.identityToken ?? req.body?.identity_token ?? "").trim();
    if (!identityToken) {
        res.status(400).json({ ok: false, error: "invalid_token" });
        return;
    }
    let profile;
    try {
        profile = await (0, apple_id_token_1.verifyAppleIdentityToken)(identityToken);
    }
    catch {
        res.status(503).json({ ok: false, error: "apple_auth_not_configured" });
        return;
    }
    if (!profile) {
        res.status(401).json({ ok: false, error: "invalid_token" });
        return;
    }
    const email = String(req.body?.email ?? "").trim();
    const name = String(req.body?.name ?? "").trim();
    const session = (0, apple_auth_session_1.completeAppleLogin)(profile, {
        email: email || undefined,
        name: name || undefined,
    });
    if ("error" in session) {
        res.status(session.status).json({ ok: false, error: session.error });
        return;
    }
    res.json({
        ok: true,
        token: session.token,
        user: session.user,
    });
}
