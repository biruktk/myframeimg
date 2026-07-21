"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";
import type { DeviceStatusPayload } from "@/lib/device-status";
import { formatLastPhotoLine } from "@/lib/format-last-photo";
import { getAppStrings } from "@/lib/i18n-app";

export function HomeView({ locale }: { locale: Locale }) {
  const base = `/${locale}/app`;
  const t = getAppStrings(locale).home;
  const [away, setAway] = useState(false);
  const [status, setStatus] = useState<DeviceStatusPayload | null>(null);
  const [statusError, setStatusError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/device/status", { cache: "no-store" });
        if (!res.ok) throw new Error("bad status");
        const data = (await res.json()) as DeviceStatusPayload;
        if (!cancelled) {
          setStatus(data);
          setStatusError(false);
        }
      } catch {
        if (!cancelled) setStatusError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const name = status?.deviceName ?? status?.deviceId ?? "—";
  const room = status?.room ?? "—";
  const lastLine = status?.lastPhotoHours != null ? formatLastPhotoLine(t.lastPhotoTemplate, status.lastPhotoHours) : "—";
  const storage = status?.storageGb != null ? `${status.storageGb}GB` : "—";
  const photos = status?.photoCount != null ? String(status.photoCount) : "—";
  const uptime = status?.uptimeDays != null ? `${status.uptimeDays}d` : "—";
  const wifiOn = status?.transport?.wifi ?? false;
  const btOn = status?.transport?.bluetooth ?? false;
  const connected = status?.connected ?? false;

  return (
    <div className="flex flex-col">
      <header className="flex items-center justify-between bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-red-500 text-white">
            <span className="text-sm">⌂</span>
          </div>
          <span className="text-lg font-bold">MyFrame</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={away}
              onChange={(e) => setAway(e.target.checked)}
              className="accent-myframe-primary"
            />
            {t.awayMode}
          </label>
          <span className="text-xl">🙂</span>
        </div>
      </header>

      <main className="space-y-4 p-4">
        {statusError && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {t.statusLoadError}
          </p>
        )}
        <Link
          href={`${base}/send`}
          className="block w-full rounded-2xl border-2 border-amber-400 bg-white p-4 text-left shadow-sm transition hover:bg-amber-50/50"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl text-red-600">💾</span>
            <div className="flex-1">
              <p className="font-bold">{t.sdTitle}</p>
              <p className="text-sm text-gray-600">{t.sdSub}</p>
            </div>
            <span className="text-gray-400">›</span>
          </div>
        </Link>

        <section className="rounded-3xl bg-white p-4 shadow-md">
          <div className="mb-3 flex items-center gap-2 text-xs text-gray-700">
            <span className={wifiOn ? "" : "opacity-40"}>📶 Wi‑Fi</span>
            <span className="text-gray-300">|</span>
            <span className={btOn ? "" : "opacity-40"}>Bluetooth</span>
            <span
              className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${
                connected ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
              }`}
            >
              {connected ? t.connected : "…"}
            </span>
          </div>
          <div className="flex gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-red-500 text-white">
              ⌂
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold">{name}</p>
              <p className="text-sm text-gray-600">{room}</p>
              <p className="text-xs text-gray-500">{lastLine}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-gray-100 pt-4 text-sm">
            <div>
              <p className="text-xs text-gray-500">{t.storage}</p>
              <p className="font-semibold">{storage}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">{t.photos}</p>
              <p className="font-semibold">{photos}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">{t.uptime}</p>
              <p className="font-semibold">{uptime}</p>
            </div>
          </div>
          <Link
            href={`${base}/settings`}
            className="mt-4 flex w-full items-center justify-between border-t border-gray-100 pt-3 text-left text-sm font-semibold text-myframe-primary"
          >
            <span className="flex items-center gap-2">
              <span>⚙</span> {t.manage}
            </span>
            <span>›</span>
          </Link>
        </section>

        <div>
          <h2 className="mb-3 text-lg font-bold">{t.quickActions}</h2>
          <div className="grid grid-cols-4 gap-2 text-center text-xs font-medium">
            {(
              [
                ["🔗", t.pair, `${base}/settings`],
                ["✈", t.send, `${base}/send`],
                ["☰", t.playlist, `${base}/playlist`],
                ["↗", t.share, `${base}/family`],
              ] as const
            ).map(([ic, lab, href]) => (
              <Link
                key={lab}
                href={href}
                className="flex flex-col items-center gap-2 rounded-2xl bg-white p-3 shadow transition hover:bg-gray-50"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-xl text-myframe-primary shadow">
                  {ic}
                </span>
                {lab}
              </Link>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-bold">{t.importPhotos}</h2>
          <Link
            href={`${base}/send`}
            className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 text-sm text-gray-600 transition hover:bg-gray-50"
          >
            <span className="text-xl">🖼</span>
            <span className="flex-1">{t.sdSub}</span>
            <span className="text-gray-400">›</span>
          </Link>
        </div>
      </main>
    </div>
  );
}
