import { NextRequest } from "next/server";

export const ADMIN_SESSION_COOKIE = "myframe_admin_session";
export const ADMIN_USER = "admin";
export const ADMIN_PASS = "admin";
export const ADMIN_TOKEN = "admin";

export function isValidAdminLogin(username: string, password: string): boolean {
  return username.trim() === ADMIN_USER && password === ADMIN_PASS;
}

export function getAdminTokenFromRequest(req: NextRequest): string | null {
  const c = req.cookies.get(ADMIN_SESSION_COOKIE)?.value?.trim() ?? "";
  if (!c) return null;
  return c;
}
