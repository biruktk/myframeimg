"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { locales, type Locale } from "@/lib/i18n";
import { getAppStrings } from "@/lib/i18n-app";
import { localeNativeNames } from "@/lib/locale-labels";

type HealthState =
  | { loading: true }
  | { loading: false; upstream: boolean; base: string };

type SettingsPayload = {
  account: { name: string; email: string; birthday: string | null };
  notifications: { birthdayReminders: boolean; uploadAlerts: boolean; offlineAlerts: boolean };
  preferences: { theme: "light" | "dark" | "system"; autoRotateMinutes: number; autoSync: boolean };
  integrations: { googlePhotosConnected: boolean; icloudConnected: boolean; wechatConnected: boolean };
};

export function SettingsView({ locale }: { locale: Locale }) {
  const s = getAppStrings(locale).settings;
  const [health, setHealth] = useState<HealthState>({ loading: true });
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/backend-health", { cache: "no-store" });
        const data = (await res.json()) as {
          upstream?: boolean;
          base?: string;
        };
        if (!cancelled) {
          setHealth({
            loading: false,
            upstream: Boolean(data.upstream),
            base: typeof data.base === "string" ? data.base : "",
          });
        }
      } catch {
        if (!cancelled) {
          setHealth({ loading: false, upstream: false, base: "" });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        if (!res.ok) throw new Error(`settings ${res.status}`);
        const json = (await res.json()) as SettingsPayload;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "load_failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveSection(
    section: "account" | "notifications" | "preferences" | "integrations",
    payload: unknown,
  ) {
    setSaving(section);
    setError(null);
    try {
      const res = await fetch(`/api/settings?section=${section}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`${section} ${res.status}`);
      const value = await res.json();
      setData((prev) => (prev ? { ...prev, [section]: value } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "save_failed");
    } finally {
      setSaving(null);
    }
  }

  const apiSub = health.loading
    ? "…"
    : health.upstream
      ? s.apiOnline
      : s.apiOffline;

  return (
    <div>
      <header className="bg-white px-4 py-3 shadow-sm">
        <h1 className="text-lg font-bold">{s.title}</h1>
      </header>
      <div className="space-y-2 p-4">
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-3">
            <span className="text-2xl text-myframe-primary">🌐</span>
            <div className="min-w-0 flex-1">
              <p className="font-bold">{s.language}</p>
              <p className="text-sm text-gray-600">{localeNativeNames[locale]}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
            {locales.map((loc) => (
              <Link
                key={loc}
                href={`/${loc}/app/settings`}
                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${
                  loc === locale
                    ? "border-myframe-primary bg-red-50 text-myframe-primary"
                    : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
                }`}
              >
                {loc.toUpperCase()}
              </Link>
            ))}
          </div>
        </div>

        {error && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {error}
          </p>
        )}

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-bold">👤 {s.account}</p>
            <button
              type="button"
              disabled={!data || saving === "account"}
              onClick={() => data && saveSection("account", data.account)}
              className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-semibold text-myframe-primary disabled:opacity-50"
            >
              {saving === "account" ? "Saving…" : "Save"}
            </button>
          </div>
          <div className="space-y-2">
            <label className="block text-xs text-gray-600">
              Name
              <input
                value={data?.account.name ?? ""}
                onChange={(e) =>
                  setData((prev) => (prev ? { ...prev, account: { ...prev.account, name: e.target.value } } : prev))
                }
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs text-gray-600">
              Email
              <input
                value={data?.account.email ?? ""}
                onChange={(e) =>
                  setData((prev) => (prev ? { ...prev, account: { ...prev.account, email: e.target.value } } : prev))
                }
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </label>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-bold">🔔 {s.notifications}</p>
            <button
              type="button"
              disabled={!data || saving === "notifications"}
              onClick={() => data && saveSection("notifications", data.notifications)}
              className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-semibold text-myframe-primary disabled:opacity-50"
            >
              {saving === "notifications" ? "Saving…" : "Save"}
            </button>
          </div>
          <div className="space-y-2 text-sm">
            {[
              ["birthdayReminders", "Birthday reminders"],
              ["uploadAlerts", "Upload alerts"],
              ["offlineAlerts", "Offline alerts"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={Boolean(data?.notifications[key as keyof SettingsPayload["notifications"]])}
                  onChange={(e) =>
                    setData((prev) =>
                      prev
                        ? { ...prev, notifications: { ...prev.notifications, [key]: e.target.checked } }
                        : prev,
                    )
                  }
                />
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-bold">⚙ {s.preferences}</p>
            <button
              type="button"
              disabled={!data || saving === "preferences"}
              onClick={() => data && saveSection("preferences", data.preferences)}
              className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-semibold text-myframe-primary disabled:opacity-50"
            >
              {saving === "preferences" ? "Saving…" : "Save"}
            </button>
          </div>
          <div className="space-y-2">
            <label className="block text-xs text-gray-600">
              Theme
              <select
                value={data?.preferences.theme ?? "system"}
                onChange={(e) =>
                  setData((prev) =>
                    prev
                      ? {
                          ...prev,
                          preferences: {
                            ...prev.preferences,
                            theme: e.target.value as "light" | "dark" | "system",
                          },
                        }
                      : prev,
                  )
                }
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label className="block text-xs text-gray-600">
              Auto-rotate minutes
              <input
                type="number"
                min={1}
                max={240}
                value={data?.preferences.autoRotateMinutes ?? 10}
                onChange={(e) =>
                  setData((prev) =>
                    prev
                      ? {
                          ...prev,
                          preferences: { ...prev.preferences, autoRotateMinutes: Number(e.target.value || 10) },
                        }
                      : prev,
                  )
                }
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm">
              <span>Auto-sync</span>
              <input
                type="checkbox"
                checked={Boolean(data?.preferences.autoSync)}
                onChange={(e) =>
                  setData((prev) =>
                    prev ? { ...prev, preferences: { ...prev.preferences, autoSync: e.target.checked } } : prev,
                  )
                }
              />
            </label>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-bold">🔗 {s.integrations}</p>
            <button
              type="button"
              disabled={!data || saving === "integrations"}
              onClick={() => data && saveSection("integrations", data.integrations)}
              className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-semibold text-myframe-primary disabled:opacity-50"
            >
              {saving === "integrations" ? "Saving…" : "Save"}
            </button>
          </div>
          <div className="space-y-2 text-sm">
            {[
              ["googlePhotosConnected", "Google Photos"],
              ["icloudConnected", "iCloud"],
              ["wechatConnected", "WeChat"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={Boolean(data?.integrations[key as keyof SettingsPayload["integrations"]])}
                  onChange={(e) =>
                    setData((prev) =>
                      prev
                        ? { ...prev, integrations: { ...prev.integrations, [key]: e.target.checked } }
                        : prev,
                    )
                  }
                />
              </label>
            ))}
          </div>
        </section>

        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <p className="font-bold text-gray-900">{s.apiBackend}</p>
          <p
            className={`mt-1 text-sm ${
              health.loading
                ? "text-gray-500"
                : health.upstream
                  ? "text-green-800"
                  : "text-amber-800"
            }`}
          >
            {apiSub}
          </p>
          {!health.loading && health.base && (
            <p className="mt-2 break-all font-mono text-[11px] text-gray-500">{health.base}</p>
          )}
        </div>
      </div>
    </div>
  );
}
