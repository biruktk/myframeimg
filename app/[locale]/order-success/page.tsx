"use client";

import { Suspense, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";

function OrderSuccessBridgeInner() {
  const { locale } = useParams<{ locale: string }>();
  const sp = useSearchParams();

  useEffect(() => {
    document.cookie = `myframe_lang=${String(locale)};path=/;max-age=31536000;SameSite=Lax`;
    const q = sp.toString();
    window.location.replace(`/order-success.html${q ? `?${q}` : ""}`);
  }, [locale, sp]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-8 text-gray-600">
      Loading…
    </main>
  );
}

export default function LocaleOrderSuccessPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-white p-8 text-gray-600">
          Loading…
        </main>
      }
    >
      <OrderSuccessBridgeInner />
    </Suspense>
  );
}
