import type { Request } from "express";
import jwt from "jsonwebtoken";

export function userJwtSecret(): string {
  const s = String(process.env.APP_JWT_SECRET ?? process.env.ADMIN_TOKEN ?? "").trim();
  if (s.length >= 16) return s;
  return "myframe-dev-change-JWT_SECRET";
}

export function signUserJwt(userId: string, email: string, platform?: string): string {
  const payload: Record<string, unknown> = { sub: userId, email };
  if (platform === "flutter" || platform === "miniapp") payload.platform = platform;
  return jwt.sign(payload, userJwtSecret(), { expiresIn: "30d" });
}

/** App platform short-name embedded in the JWT at login ("flutter" | "miniapp"). */
export type AppPlatform = "flutter" | "miniapp";

/** Payload from app `/api/auth/*` Bearer tokens */
export type AuthedUser = { userId: string; email: string; platform?: AppPlatform };

/** Normalize an arbitrary platform token to "flutter"/"miniapp", else "" (legacy). */
export function normalizePlatform(platform: unknown): AppPlatform | "" {
  const raw = String(platform ?? "").trim().toLowerCase();
  if (raw === "flutter" || raw === "miniapp") return raw;
  return "";
}

/**
 * Resolve the client app platform for a request.
 * Precedence: explicit `x-app-platform` header > `app_platform` query/body > JWT claim.
 * Return "" when unknown (callers treat empty as "legacy").
 */
export function platformFromRequest(
  req: Request,
  tokenPlatform?: string,
): AppPlatform | "" {
  const viaHeader = normalizePlatform(req.header("x-app-platform") ?? req.header("app-platform"));
  if (viaHeader) return viaHeader;
  const raw =
    String((req.query && req.query.app_platform) ?? "") ||
    String((req.body && req.body.app_platform) ?? "");
  const viaBody = normalizePlatform(raw);
  if (viaBody) return viaBody;
  return normalizePlatform(tokenPlatform);
}

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
    return { userId, email, platform: normalizePlatform(p.platform) as AuthedUser["platform"] };
  } catch {
    return null;
  }
}
