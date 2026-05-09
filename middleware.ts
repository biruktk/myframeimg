import type { NextRequest } from "next/server";

import { proxy } from "./proxy";

/** Locale prefix for marketing pages — must not intercept `/api/*` (Flutter, frame, admin proxies). */
export function middleware(request: NextRequest) {
  return proxy(request);
}

export { config } from "./proxy";
