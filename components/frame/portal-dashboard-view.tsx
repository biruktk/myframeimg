"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Locale } from "@/lib/i18n";

type DashboardPayload = {
  ok: boolean;
  user?: { id: string; name: string; email: string; subscriptionTier: string; roleLabel: string };
  stats?: {
    activeDevices: number;
    onlineDevices: number;
    familyMembers: number;
    photosThisMonth: number;
    aiGenerated: number;
  };
  devices?: Array<{
    id: string;
    bleMac: string;
    wifiStatus: string;
    online: boolean;
    firmwareVersion: string;
    slideshowIntervalMinutes: number;
    slideshowImageCount: number;
    batteryPct: number | null;
  }>;
  recentPhotos?: Array<{ id: string; thumbUrl: string; atMs: number; deviceId: string }>;
  aiPhotos?: Array<{ id: string; thumbUrl: string }>;
  familyMembers?: Array<{ userId: string; name: string; email: string; role: string }>;
  activity?: Array<{ id: string; kind: string; label: string; atMs: number }>;
  playlists?: Array<{
    id: string;
    title: string;
    photoIds: string[];
    scheduleRule: string | null;
    assignedFrameIds: string[];
    system: boolean;
  }>;
  integrations?: { googlePhotosConnected: boolean; icloudConnected: boolean; wechatConnected: boolean };
  preferences?: { theme: string; autoRotateMinutes: number; autoSync: boolean };
};

const copy = {
  en: {
    overview: "Overview",
    devices: "Devices",
    photos: "Photos",
    playlist: "Playlist",
    integrations: "Integrations",
    settings: "Settings",
    logoutHint: "App navigation",
    home: "Classic home",
    send: "Send",
    activeDevices: "Active devices",
    familyMembersCount: "Family members",
    photosMonth: "Photos this month",
    aiGen: "AI generated",
    myDevices: "My devices",
    online: "Online",
    offline: "Offline",
    recentPhotos: "Recent photos",
    familyMembers: "Family members",
    activity: "Activity",
    unnamed: "Photos",
    proBanner: "Upgrade to PRO for unlimited devices",
    slideshowInterval: "Slideshow interval (minutes)",
    savePlaylist: "Save playlist",
    noPlaylist: "No playlists linked to your devices yet.",
    connectServices: "Connected services",
    deviceSettingsPlaceholder: "Open device settings from the Classic Send tab for pairing workflows.",
    loadError: "Could not load your dashboard.",
  },
  zh: {
    overview: "概览",
    devices: "设备",
    photos: "照片",
    playlist: "播放列表",
    integrations: "集成",
    settings: "设置",
    logoutHint: "应用导航",
    home: "经典主页",
    send: "发送",
    activeDevices: "活跃设备",
    familyMembersCount: "家庭成员",
    photosMonth: "本月照片",
    aiGen: "AI 生成",
    myDevices: "我的设备",
    online: "在线",
    offline: "离线",
    recentPhotos: "最近照片",
    familyMembers: "家庭成员",
    activity: "动态",
    unnamed: "照片",
    proBanner: "升级到 PRO，解锁更多设备",
    slideshowInterval: "轮播间隔（分钟）",
    savePlaylist: "保存播放列表",
    noPlaylist: "暂无关联到设备的播放列表。",
    connectServices: "已连接的服务",
    deviceSettingsPlaceholder: "配对与设备设置请使用经典「发送」页中的流程。",
    loadError: "无法加载仪表盘。",
  },
};

type Screen = "overview" | "devices" | "photos" | "playlist" | "integrations" | "settings";

export function PortalDashboardView({ locale }: { locale: Locale }) {
  const base = `/${locale}/app`;
  const [langUi, setLangUi] = useState<"en" | "zh">(locale === "zh" ? "zh" : "en");
  const t = copy[langUi];
  const [screen, setScreen] = useState<Screen>("overview");
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [err, setErr] = useState(false);
  const [playlistEdit, setPlaylistEdit] = useState<Record<string, { title: string }>>({});

  const load = useCallback(async () => {
    setErr(false);
    try {
      const res = await fetch("/api/home", { cache: "no-store" });
      if (!res.ok) throw new Error("bad");
      const j = (await res.json()) as DashboardPayload;
      setData(j);
      const next: Record<string, { title: string }> = {};
      for (const p of j.playlists ?? []) {
        next[p.id] = { title: p.title };
      }
      setPlaylistEdit(next);
    } catch {
      setErr(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const elId = "myframe-portal-font-awesome";
    if (typeof document !== "undefined" && !document.getElementById(elId)) {
      const l = document.createElement("link");
      l.id = elId;
      l.rel = "stylesheet";
      l.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css";
      document.head.appendChild(l);
    }
  }, []);

  const firstPlaylistId = data?.playlists?.[0]?.id;

  const saveFirstPlaylist = async () => {
    if (!firstPlaylistId) return;
    const ed = playlistEdit[firstPlaylistId];
    if (!ed) return;
    await fetch(`/api/user/playlists/${encodeURIComponent(firstPlaylistId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: ed.title }),
    });
    void load();
  };

  const nav = useMemo(
    () =>
      [
        { id: "overview" as const, icon: "fa-house", label: t.overview },
        { id: "devices" as const, icon: "fa-tablet-screen-button", label: t.devices },
        { id: "photos" as const, icon: "fa-image", label: t.photos },
        { id: "playlist" as const, icon: "fa-list", label: t.playlist },
        { id: "integrations" as const, icon: "fa-plug", label: t.integrations },
        { id: "settings" as const, icon: "fa-gear", label: t.settings },
      ] as const,
    [t],
  );

  const stats = data?.stats;
  const user = data?.user;
  const isPro = user?.subscriptionTier === "pro";

  return (
    <div className="flex min-h-[calc(100vh-0px)] w-full bg-[#FAFAFA] text-[#1A1A1A]">
      <aside className="fixed left-0 top-0 z-30 flex h-screen w-[260px] flex-col bg-[#DC2626] text-white shadow-lg">
        <div className="border-b border-white/20 p-6">
          <div className="text-xl font-bold tracking-tight">MyFrame</div>
          <p className="mt-1 text-xs text-white/70">Portal</p>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setScreen(item.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-[15px] font-medium transition ${
                screen === item.id ? "bg-white/20 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <i className={`fa-solid ${item.icon} w-5 text-center`} aria-hidden />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 text-sm font-bold">
              {(user?.name ?? "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user?.name ?? "—"}</p>
              <p className="truncate text-xs text-white/70">
                {user?.roleLabel ?? "—"} · {user?.subscriptionTier ?? ""}
              </p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${langUi === "en" ? "bg-white text-[#DC2626]" : "bg-white/10 text-white"}`}
              onClick={() => setLangUi("en")}
            >
              EN
            </button>
            <button
              type="button"
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${langUi === "zh" ? "bg-white text-[#DC2626]" : "bg-white/10 text-white"}`}
              onClick={() => setLangUi("zh")}
            >
              中文
            </button>
          </div>
          <p className="mt-3 text-[10px] uppercase tracking-wider text-white/40">{t.logoutHint}</p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Link href={`${base}/home`} className="text-xs text-white/80 underline">
              {t.home}
            </Link>
            <Link href={`${base}/send`} className="text-xs text-white/80 underline">
              {t.send}
            </Link>
          </div>
        </div>
      </aside>

      <main className="ml-[260px] flex-1 p-8">
        {err && (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">{t.loadError}</p>
        )}

        {screen === "overview" && (
          <div className="space-y-8">
            <header className="flex flex-wrap items-center justify-between gap-4">
              <h1 className="text-3xl font-bold">{t.overview}</h1>
              <button
                type="button"
                className="rounded-xl bg-[#DC2626] px-5 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-[#B91C1C]"
                onClick={() => void load()}
              >
                Refresh
              </button>
            </header>
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard icon="fa-mobile-screen" label={t.activeDevices} value={String(stats?.activeDevices ?? 0)} />
              <StatCard icon="fa-users" label={t.familyMembersCount} value={String(stats?.familyMembers ?? 0)} />
              <StatCard icon="fa-camera" label={t.photosMonth} value={String(stats?.photosThisMonth ?? 0)} />
              <StatCard icon="fa-wand-magic-sparkles" label={t.aiGen} value={String(stats?.aiGenerated ?? 0)} />
            </div>
            <div className="grid gap-6 lg:grid-cols-3">
              <section className="rounded-2xl bg-white p-6 shadow-md lg:col-span-2">
                <h2 className="mb-4 text-lg font-semibold">{t.myDevices}</h2>
                <ul className="space-y-3">
                  {(data?.devices ?? []).map((d) => (
                    <li key={d.id} className="flex items-center justify-between rounded-xl bg-[#FAFAFA] px-4 py-3">
                      <div>
                        <p className="font-semibold">{d.id}</p>
                        <p className="text-xs text-gray-500">{d.bleMac}</p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          d.online ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {d.online ? t.online : t.offline}
                      </span>
                    </li>
                  ))}
                  {!data?.devices?.length && <li className="text-sm text-gray-500">—</li>}
                </ul>
              </section>
              <section className="rounded-2xl bg-white p-6 shadow-md">
                <h2 className="mb-4 text-lg font-semibold">{t.activity}</h2>
                <ul className="max-h-80 space-y-2 overflow-auto text-sm text-gray-700">
                  {(data?.activity ?? []).slice(0, 12).map((a) => (
                    <li key={a.id} className="border-b border-gray-100 py-2">
                      <p className="font-medium">{a.label}</p>
                      <p className="text-xs text-gray-400">{new Date(a.atMs).toLocaleString()}</p>
                    </li>
                  ))}
                  {!data?.activity?.length && <li className="text-gray-500">—</li>}
                </ul>
              </section>
            </div>
            <section className="rounded-2xl bg-white p-6 shadow-md">
              <h2 className="mb-4 text-lg font-semibold">{t.recentPhotos}</h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
                {(data?.recentPhotos ?? []).slice(0, 12).map((p) => (
                  <div key={p.id} className="overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.thumbUrl} alt="" className="aspect-square w-full object-cover" />
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-2xl bg-white p-6 shadow-md">
              <h2 className="mb-4 text-lg font-semibold">{t.familyMembers}</h2>
              <ul className="divide-y divide-gray-100">
                {(data?.familyMembers ?? []).map((m) => (
                  <li key={m.userId} className="flex items-center justify-between py-3 text-sm">
                    <span className="font-medium">{m.name}</span>
                    <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-[#DC2626]">{m.role}</span>
                  </li>
                ))}
                {!data?.familyMembers?.length && <li className="text-gray-500">—</li>}
              </ul>
            </section>
          </div>
        )}

        {screen === "devices" && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold">{t.devices}</h1>
            {!isPro && (
              <div className="rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 p-6 text-white shadow-lg">
                <p className="font-semibold">{t.proBanner}</p>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              {(data?.devices ?? []).map((d) => (
                <article key={d.id} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-md">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-bold">{d.id}</h3>
                      <p className="text-sm text-gray-500">{d.bleMac}</p>
                    </div>
                    <span className={`text-xs font-semibold ${d.online ? "text-emerald-600" : "text-gray-400"}`}>
                      {d.online ? t.online : t.offline}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-gray-600">
                    Firmware {d.firmwareVersion} · Slideshow queue ~{d.slideshowImageCount} · Interval {d.slideshowIntervalMinutes}m
                  </p>
                  <p className="mt-4 text-xs text-gray-400">{t.deviceSettingsPlaceholder}</p>
                </article>
              ))}
            </div>
          </div>
        )}

        {screen === "photos" && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold">{t.photos}</h1>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              {(data?.recentPhotos ?? []).map((p) => (
                <div key={p.id} className="overflow-hidden rounded-xl border bg-white shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.thumbUrl} alt="" className="aspect-square w-full object-cover" />
                </div>
              ))}
            </div>
            <h2 className="text-xl font-semibold">AI</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {(data?.aiPhotos ?? []).map((p) => (
                <div key={p.id} className="overflow-hidden rounded-xl border bg-white shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.thumbUrl} alt="" className="aspect-square w-full object-cover" />
                </div>
              ))}
              {!data?.aiPhotos?.length && <p className="text-sm text-gray-500">—</p>}
            </div>
          </div>
        )}

        {screen === "playlist" && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold">{t.playlist}</h1>
            {(data?.playlists ?? []).map((p) => {
              const ed = playlistEdit[p.id] ?? { title: p.title };
              return (
                <div key={p.id} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-md">
                  <p className="text-xs text-gray-400">{p.system ? "System" : "Custom"}</p>
                  <input
                    className="mt-2 w-full rounded-lg border px-3 py-2 text-lg font-semibold"
                    value={ed.title}
                    disabled={p.system}
                    onChange={(e) => setPlaylistEdit((s) => ({ ...s, [p.id]: { ...ed, title: e.target.value } }))}
                  />
                  <p className="mt-3 text-sm text-gray-600">
                    {p.photoIds.length} photos · Frames: {p.assignedFrameIds.join(", ") || "—"}
                  </p>
                  {!p.system && p.id === firstPlaylistId && (
                    <button
                      type="button"
                      className="mt-4 rounded-xl bg-[#DC2626] px-4 py-2 text-sm font-semibold text-white"
                      onClick={() => void saveFirstPlaylist()}
                    >
                      {t.savePlaylist}
                    </button>
                  )}
                </div>
              );
            })}
            {!data?.playlists?.length && <p className="text-gray-500">{t.noPlaylist}</p>}
          </div>
        )}

        {screen === "integrations" && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold">{t.integrations}</h1>
            <p className="text-sm text-gray-600">{t.connectServices}</p>
            <div className="flex flex-wrap gap-3">
              <Badge on={data?.integrations?.wechatConnected} label="WeChat" />
              <Badge on={data?.integrations?.googlePhotosConnected} label="Google Photos" />
              <Badge on={data?.integrations?.icloudConnected} label="iCloud" />
            </div>
          </div>
        )}

        {screen === "settings" && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold">{t.settings}</h1>
            <div className="max-w-lg rounded-2xl border bg-white p-6 shadow-md">
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-gray-500">Email</dt>
                  <dd className="font-medium">{user?.email}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Theme (global demo)</dt>
                  <dd className="font-medium">{data?.preferences?.theme}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">Auto-rotate (minutes)</dt>
                  <dd className="font-medium">{data?.preferences?.autoRotateMinutes}</dd>
                </div>
              </dl>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-md">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#DC2626] text-white">
        <i className={`fa-solid ${icon} text-xl`} aria-hidden />
      </div>
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
}

function Badge({ on, label }: { on?: boolean; label: string }) {
  return (
    <span
      className={`rounded-full border px-4 py-2 text-sm font-semibold ${
        on ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-gray-200 bg-gray-50 text-gray-500"
      }`}
    >
      {label} {on ? "●" : "○"}
    </span>
  );
}
