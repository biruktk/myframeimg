import { NextRequest } from "next/server";

export const ADMIN_SESSION_COOKIE = "myframe_admin_session";
export const ADMIN_USER = process.env.ADMIN_USER?.trim() || "admin";
export const ADMIN_PASS = process.env.ADMIN_PASS?.trim() || "admin";
export const ADMIN_TOKEN = process.env.ADMIN_TOKEN?.trim() || "admin";

export function isValidAdminLogin(username: string, password: string): boolean {
  return username.trim().toLowerCase() === ADMIN_USER.toLowerCase() && password.trim() === ADMIN_PASS;
}

export function getAdminTokenFromRequest(req: NextRequest): string | null {
  const c = req.cookies.get(ADMIN_SESSION_COOKIE)?.value?.trim() ?? "";
  if (!c) return null;
  return c;
}
