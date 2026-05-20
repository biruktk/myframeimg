import { NextFunction, Request, Response } from "express";

import { db } from "../db/store";

export type AdminRole = "super_admin" | "admin";

/** Resolved after [requireAdminToken]. */
export function getAdminRole(req: Request): AdminRole {
  const headerRole = String(req.header("x-admin-role") ?? "").trim();
  if (headerRole === "super_admin" || headerRole === "admin") return headerRole;

  const username = String(req.header("x-admin-user") ?? process.env.ADMIN_USER ?? "admin").trim();
  const cms = db.read().marketingCms?.cmsAdmins ?? [];
  const row = cms.find(
    (a) =>
      a.username === username ||
      a.email === username ||
      String(a.id) === username,
  );
  return row?.role === "super_admin" ? "super_admin" : "admin";
}

/** Blocks non–super-admins from CMS user management and destructive ops. */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (getAdminRole(req) !== "super_admin") {
    res.status(403).json({ ok: false, error: "super_admin_required" });
    return;
  }
  next();
}
