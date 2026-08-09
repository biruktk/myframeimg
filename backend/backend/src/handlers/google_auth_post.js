"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleGoogleAuthPost = handleGoogleAuthPost;
const google_auth_session_1 = require("../services/google_auth_session");
const google_id_token_1 = require("../services/google_id_token");
/** POST body: `{ idToken: string }` — shared by `/api/auth/google` and `/mobile/google-auth`. */
async function handleGoogleAuthPost(req, res) {
    if (!(0, google_id_token_1.isGoogleAuthConfigured)()) {
        res.status(503).json({ ok: false, error: "google_auth_not_configured" });
        return;
    }
    const idToken = String(req.body?.idToken ?? "").trim();
    if (!idToken) {
        res.status(400).json({ ok: false, error: "invalid_token" });
        return;
    }
    let profile;
    try {
        profile = await (0, google_id_token_1.verifyGoogleIdToken)(idToken);
    }
    catch {
        res.status(503).json({ ok: false, error: "google_auth_not_configured" });
        return;
    }
    if (!profile) {
        res.status(401).json({ ok: false, error: "invalid_token" });
        return;
    }
    const session = (0, google_auth_session_1.completeGoogleLogin)(profile);
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
