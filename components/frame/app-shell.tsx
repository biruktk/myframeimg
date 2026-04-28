"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Locale } from "@/lib/i18n";
import { getAppStrings } from "@/lib/i18n-app";

const tabs = ["home", "send", "playlist", "family", "settings"] as const;

type Tab = (typeof tabs)[number];

function tabFromPath(pathname: string): Tab {
  const seg = pathname.split("/").filter(Boolean);
  const last = seg[seg.length - 1];
  if (tabs.includes(last as Tab)) return last as Tab;
  return "home";
}

export function AppShell({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = tabFromPath(pathname);
  const t = getAppStrings(locale).nav;

  const href = (tab: Tab) => `/${locale}/app/${tab}`;

  const label: Record<Tab, string> = {
    home: t.home,
    send: t.send,
    playlist: t.playlist,
    family: t.family,
    settings: t.settings,
  };

  const renderIcon = (tab: Tab, on: boolean) => {
    const cls = on ? "text-white" : "text-gray-500";
    switch (tab) {
      case "home":
        return (
          <svg className={`h-6 w-6 ${cls}`} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
          </svg>
        );
      case "send":
        return (
          <svg className={`h-6 w-6 ${cls}`} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        );
      case "playlist":
        return (
          <svg className={`h-6 w-6 ${cls}`} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />
          </svg>
        );
      case "family":
        return (
          <svg className={`h-6 w-6 ${cls}`} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
          </svg>
        );
      case "settings":
        return (
          <svg className={`h-6 w-6 ${cls}`} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z" />
          </svg>
        );
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-myframe-soft text-gray-900">
      <div className="flex-1 pb-20">{children}</div>
      <nav className="fixed bottom-0 left-0 right-0 z-10 border-t border-gray-200 bg-white">
        <div className="mx-auto flex max-w-md justify-between px-2 py-2">
          {tabs.map((tab) => {
            const on = active === tab;
            return (
              <Link
                key={tab}
                href={href(tab)}
                className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-1 text-[11px] font-semibold ${
                  on ? "text-myframe-primary" : "text-gray-500"
                }`}
              >
                <span
                  className={`flex h-10 w-14 items-center justify-center rounded-xl ${
                    on ? "bg-myframe-primary shadow-sm" : "bg-transparent"
                  }`}
                >
                  {renderIcon(tab, on)}
                </span>
                {label[tab]}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
