import {
  USER_EMAIL_COOKIE,
  USER_ID_COOKIE,
  USER_NAME_COOKIE,
  USER_TOKEN_COOKIE,
} from "@/lib/user-auth";

export type AuthUserPayload = {
  id: string;
  email: string;
  name: string;
};

export type AuthTokenPayload = {
  token: string;
  user: AuthUserPayload;
};

export function authCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  } as const;
}

type CookieStore = {
  set: (name: string, value: string, options: Record<string, unknown>) => void;
};

export function setAuthSessionCookies(store: CookieStore, session: AuthTokenPayload): void {
  const opts = authCookieOptions();
  store.set(USER_TOKEN_COOKIE, session.token, opts);
  store.set(USER_ID_COOKIE, session.user.id, opts);
  store.set(USER_EMAIL_COOKIE, session.user.email, opts);
  store.set(USER_NAME_COOKIE, session.user.name, opts);
}

export function clearAuthSessionCookies(store: CookieStore): void {
  const opts = { ...authCookieOptions(), maxAge: 0 };
  store.set(USER_TOKEN_COOKIE, "", opts);
  store.set(USER_ID_COOKIE, "", opts);
  store.set(USER_EMAIL_COOKIE, "", opts);
  store.set(USER_NAME_COOKIE, "", opts);
}
