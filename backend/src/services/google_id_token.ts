import { OAuth2Client } from "google-auth-library";

export type GoogleProfile = {
  sub: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

/** Comma-separated OAuth client IDs (Web + Android + iOS) from Google Cloud Console. */
export function googleOAuthClientIds(): string[] {
  const raw =
    process.env.GOOGLE_OAUTH_CLIENT_IDS?.trim() ||
    process.env.GOOGLE_CLIENT_ID?.trim() ||
    "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isGoogleAuthConfigured(): boolean {
  return googleOAuthClientIds().length > 0;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile | null> {
  const audiences = googleOAuthClientIds();
  if (!audiences.length) {
    throw new Error("google_auth_not_configured");
  }

  const client = new OAuth2Client();
  try {
    const ticket = await client.verifyIdToken({
      idToken: idToken.trim(),
      audience: audiences,
    });
    const p = ticket.getPayload();
    if (!p?.sub) return null;

    const email = String(p.email ?? "")
      .trim()
      .toLowerCase();
    if (!email || !email.includes("@")) return null;

    const name = String(p.name ?? p.given_name ?? email.split("@")[0] ?? "User").trim();
    return {
      sub: p.sub,
      email,
      name: name || email.split("@")[0] || "User",
      emailVerified: p.email_verified === true,
    };
  } catch {
    return null;
  }
}
