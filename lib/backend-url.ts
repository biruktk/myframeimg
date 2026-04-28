/**
 * Express MyFrame API base (no trailing slash). Used by Next.js route handlers only.
 * Override with env: `MYFRAME_API_URL=http://127.0.0.1:3001`
 */
export function getMyframeApiBase(): string {
  const raw = process.env.MYFRAME_API_URL?.trim() || "https://api.myframe.ink";
  return raw.replace(/\/$/, "");
}
