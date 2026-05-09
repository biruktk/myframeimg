"use client";

import { useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";

/** Bridges `/[lang]/cart` (from site-runtime) to static `cart-checkout.html` with language cookie. */
export default function LocaleCartBridge() {
  const { locale } = useParams<{ locale: string }>();
  const sp = useSearchParams();

  useEffect(() => {
    document.cookie = `myframe_lang=${String(locale)};path=/;max-age=31536000;SameSite=Lax`;
    try {
      localStorage.setItem("myframeLang", String(locale));
    } catch {
      /* ignore */
    }
    const q = sp.toString();
    window.location.replace(`/cart-checkout.html${q ? `?${q}` : ""}`);
  }, [locale, sp]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-8 text-gray-600">
      Loading checkout…
    </main>
  );
}
