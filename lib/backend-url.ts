/**
 * Express MyFrame API base (no trailing slash). Used by Next.js route handlers only.
 * Override with env: `MYFRAME_API_URL=http://127.0.0.1:3001`
 */
export function getMyframeApiBase(): string {
  const raw = process.env.MYFRAME_API_URL?.trim() || "http://127.0.0.1:3001";
  return raw.replace(/\/$/, "");
}

/** Matches Express `ADMIN_TOKEN` — forwarded as `x-admin-token` on admin/settings proxy routes. */
export function myframeBackendAdminHeaders(adminToken?: string): Record<string, string> {
  const t =
    adminToken?.trim() ??
    process.env.ADMIN_TOKEN?.trim() ??
    process.env.MYFRAME_ADMIN_TOKEN?.trim() ??
    "";
  return t ? { "x-admin-token": t } : {};
}
