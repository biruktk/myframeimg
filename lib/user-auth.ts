import { NextRequest } from "next/server";

export const USER_TOKEN_COOKIE = "myframe_user_token";
export const USER_ID_COOKIE = "myframe_user_id";
export const USER_EMAIL_COOKIE = "myframe_user_email";
export const USER_NAME_COOKIE = "myframe_user_name";

export function getUserToken(req: NextRequest): string | null {
  const t = req.cookies.get(USER_TOKEN_COOKIE)?.value?.trim() ?? "";
  return t || null;
}
