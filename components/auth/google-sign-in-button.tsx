"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: {
            client_id: string;
            callback: (resp: { credential?: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            opts: { theme?: string; size?: string; width?: number; text?: string },
          ) => void;
        };
      };
    };
  }
}

type Props = {
  locale: Locale;
  disabled?: boolean;
};

export function GoogleSignInButton({ locale, disabled }: Props) {
  const router = useRouter();
  const hostRef = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState("");
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? "";

  useEffect(() => {
    if (!clientId || disabled || !hostRef.current) return;

    let cancelled = false;

    async function boot() {
      if (!window.google?.accounts?.id) {
        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector('script[data-myframe-gis="1"]');
          if (existing) {
            existing.addEventListener("load", () => resolve(), { once: true });
            return;
          }
          const s = document.createElement("script");
          s.src = "https://accounts.google.com/gsi/client";
          s.async = true;
          s.defer = true;
          s.dataset.myframeGis = "1";
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("gsi_load_failed"));
          document.head.appendChild(s);
        });
      }
      if (cancelled || !hostRef.current || !window.google?.accounts?.id) return;

      hostRef.current.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (resp) => {
          const credential = resp.credential?.trim() ?? "";
          if (!credential) return;
          setErr("");
          try {
            const res = await fetch("/api/auth/google", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ idToken: credential }),
            });
            const data = await res.json().catch(() => null);
            if (!res.ok) {
              setErr(data?.error ?? "Google sign-in failed");
              return;
            }
            router.replace(`/${locale}/app/home`);
          } catch {
            setErr("Google sign-in failed");
          }
        },
      });
      window.google.accounts.id.renderButton(hostRef.current, {
        theme: "outline",
        size: "large",
        width: 320,
        text: "continue_with",
      });
    }

    void boot().catch(() => setErr("Could not load Google Sign-In"));
    return () => {
      cancelled = true;
    };
  }, [clientId, disabled, locale, router]);

  if (!clientId) return null;

  return (
    <div className="space-y-2">
      <div ref={hostRef} className="flex justify-center" />
      {err ? <p className="text-center text-sm text-red-700">{err}</p> : null}
    </div>
  );
}
