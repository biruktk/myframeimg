"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userJwtSecret = userJwtSecret;
exports.signUserJwt = signUserJwt;
exports.readBearer = readBearer;
exports.verifyUserJwtBearer = verifyUserJwtBearer;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function userJwtSecret() {
    const s = String(process.env.APP_JWT_SECRET ?? process.env.ADMIN_TOKEN ?? "").trim();
    if (s.length >= 16)
        return s;
    return "myframe-dev-change-JWT_SECRET";
}
function signUserJwt(userId, email) {
    return jsonwebtoken_1.default.sign({ sub: userId, email }, userJwtSecret(), { expiresIn: "30d" });
}
function readBearer(req) {
    const raw = String(req.header("authorization") ?? "").trim();
    const m = raw.match(/^Bearer\s+(.+)/i);
    const tok = (m?.[1] ?? "").trim();
    return tok.length > 0 ? tok : null;
}
function verifyUserJwtBearer(req) {
    const tok = readBearer(req);
    if (!tok)
        return null;
    try {
        const p = jsonwebtoken_1.default.verify(tok, userJwtSecret());
        const userId = String(p.sub ?? "");
        const email = String(p.email ?? "");
        if (!userId)
            return null;
        return { userId, email };
    }
    catch {
        return null;
    }
}
