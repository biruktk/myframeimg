export const DOC_VERSION = "1.0.0";

export function portalOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
}
