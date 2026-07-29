import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { lookupGeoFromRequest } from "@/lib/geo-location";
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n";

const LOCALE_COOKIE = "myframe_lang";
const MANUAL_LOCALE_COOKIE = "myframe_lang_manual";

function readManualLocale(request: NextRequest): Locale | null {
  if (request.cookies.get(MANUAL_LOCALE_COOKIE)?.value !== "1") return null;
  const saved = request.cookies.get(LOCALE_COOKIE)?.value ?? "";
  return isLocale(saved) ? saved : null;
}

async function resolveGeoLocale(request: NextRequest): Promise<Locale> {
  const geo = await lookupGeoFromRequest(request);
  return isLocale(geo.recommendedLanguage) ? geo.recommendedLanguage : defaultLocale;
}

function withLocaleCookie(response: NextResponse, locale: Locale, manual: boolean) {
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  if (manual) {
    response.cookies.set(MANUAL_LOCALE_COOKIE, "1", {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/") ||
    pathname === "/api" ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/mdm") ||
    pathname.startsWith("/devs") ||
    pathname === "/download" ||
    pathname.startsWith("/managemyframe") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const segments = pathname.split("/").filter(Boolean);
  const firstSegment = segments[0];
  const manualLocale = readManualLocale(request);

  if (firstSegment && isLocale(firstSegment)) {
    if (manualLocale) {
      return NextResponse.next();
    }
    const geo = await lookupGeoFromRequest(request);
    if (
      geo.forceLocale &&
      isLocale(geo.recommendedLanguage) &&
      geo.recommendedLanguage !== firstSegment
    ) {
      const redirectUrl = request.nextUrl.clone();
      const rest = segments.slice(1).join("/");
      redirectUrl.pathname = rest
        ? `/${geo.recommendedLanguage}/${rest}`
        : `/${geo.recommendedLanguage}`;
      return withLocaleCookie(NextResponse.redirect(redirectUrl), geo.recommendedLanguage, false);
    }
    return NextResponse.next();
  }

  const targetLocale = manualLocale ?? (await resolveGeoLocale(request));
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname =
    pathname === "/" ? `/${targetLocale}` : `/${targetLocale}${pathname}`;
  return withLocaleCookie(NextResponse.redirect(redirectUrl), targetLocale, false);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
