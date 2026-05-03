import type { Request } from "express";
import jwt from "jsonwebtoken";

export function userJwtSecret(): string {
  const s = String(process.env.APP_JWT_SECRET ?? process.env.ADMIN_TOKEN ?? "").trim();
  if (s.length >= 16) return s;
  return "myframe-dev-change-JWT_SECRET";
}

export function signUserJwt(userId: string, email: string): string {
  return jwt.sign({ sub: userId, email }, userJwtSecret(), { expiresIn: "30d" });
}

/** Payload from app `/api/auth/*` Bearer tokens */
export type AuthedUser = { userId: string; email: string };

export function readBearer(req: Request): string | null {
  const raw = String(req.header("authorization") ?? "").trim();
  const m = raw.match(/^Bearer\s+(.+)/i);
  const tok = (m?.[1] ?? "").trim();
  return tok.length > 0 ? tok : null;
}

export function verifyUserJwtBearer(req: Request): AuthedUser | null {
  const tok = readBearer(req);
  if (!tok) return null;
  try {
    const p = jwt.verify(tok, userJwtSecret()) as jwt.JwtPayload;
    const userId = String(p.sub ?? "");
    const email = String(p.email ?? "");
    if (!userId) return null;
    return { userId, email };
  } catch {
    return null;
  }
}
