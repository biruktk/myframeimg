"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAdminRole = getAdminRole;
exports.requireSuperAdmin = requireSuperAdmin;
const store_1 = require("../db/store");
/** Resolved after [requireAdminToken]. */
function getAdminRole(req) {
    const headerRole = String(req.header("x-admin-role") ?? "").trim();
    if (headerRole === "super_admin" || headerRole === "admin")
        return headerRole;
    const username = String(req.header("x-admin-user") ?? process.env.ADMIN_USER ?? "admin").trim();
    const cms = store_1.db.read().marketingCms?.cmsAdmins ?? [];
    const row = cms.find((a) => a.username === username ||
        a.email === username ||
        String(a.id) === username);
    return row?.role === "super_admin" ? "super_admin" : "admin";
}
/** Blocks non–super-admins from CMS user management and destructive ops. */
function requireSuperAdmin(req, res, next) {
    if (getAdminRole(req) !== "super_admin") {
        res.status(403).json({ ok: false, error: "super_admin_required" });
        return;
    }
    next();
}
