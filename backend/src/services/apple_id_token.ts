import crypto from "crypto";
import jwt from "jsonwebtoken";

export type AppleProfile = {
  sub: string;
  email?: string;
};

type AppleJwk = crypto.JsonWebKey & { kid: string };

let jwksCache: { keys: AppleJwk[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

/** Comma-separated iOS bundle IDs (default: com.myframe.minyuex). */
export function appleClientIds(): string[] {
  const raw =
    process.env.APPLE_CLIENT_IDS?.trim() ||
    process.env.APPLE_BUNDLE_ID?.trim() ||
    "com.myframe.minyuex";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAppleAuthConfigured(): boolean {
  return appleClientIds().length > 0;
}

async function getAppleJwks(): Promise<AppleJwk[]> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const response = await fetch("https://appleid.apple.com/auth/keys");
  const data = (await response.json()) as { keys?: AppleJwk[] };
  const keys = (data.keys ?? []).filter((k) => k.kid && k.kty === "RSA");
  jwksCache = { keys, fetchedAt: now };
  return keys;
}

function pemFromJwk(jwk: AppleJwk): string {
  const keyObject = crypto.createPublicKey({ key: jwk, format: "jwk" });
  return keyObject.export({ type: "spki", format: "pem" }) as string;
}

export async function verifyAppleIdentityToken(identityToken: string): Promise<AppleProfile | null> {
  const audiences = appleClientIds();
  if (!audiences.length) {
    throw new Error("apple_auth_not_configured");
  }

  const decoded = jwt.decode(identityToken.trim(), { complete: true });
  if (!decoded || typeof decoded === "string") return null;

  const kid = decoded.header?.kid;
  if (!kid) return null;

  const keys = await getAppleJwks();
  const jwk = keys.find((k) => k.kid === kid);
  if (!jwk) return null;

  const pem = pemFromJwk(jwk);
  try {
    let payload: jwt.JwtPayload | null = null;
    for (const aud of audiences) {
      try {
        payload = jwt.verify(identityToken.trim(), pem, {
          algorithms: ["RS256"],
          issuer: "https://appleid.apple.com",
          audience: aud,
        }) as jwt.JwtPayload;
        break;
      } catch {
        /* try next bundle id */
      }
    }
    if (!payload) return null;

    const sub = String(payload.sub ?? "").trim();
    if (!sub) return null;

    const rawEmail = String(payload.email ?? "").trim().toLowerCase();
    const email =
      rawEmail && rawEmail.includes("@") ? rawEmail : undefined;

    return { sub, email };
  } catch {
    return null;
  }
}
