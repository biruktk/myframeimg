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
    name?: string;
    bleMac: string;
    wifiStatus: string;
    online: boolean;
    firmwareVersion: string;
    slideshowIntervalMinutes: number;
    slideshowImageCount: number;
    batteryPct: number | null;
    lastSeenAtMs?: number | null;
    lastPhotoAtMs?: number | null;
  }>;
  recentPhotos?: Array<{ id: string; thumbUrl: string; atMs: number; deviceId: string }>;
  aiPhotos?: Array<{ id: string; thumbUrl: string }>;
  familyMembers?: Array<{ userId: string; name: string; email: string; role: string; isSelf?: boolean }>;
  familyInviteCode?: string | null;
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
    settingsSection: "Settings",
    shareAction: "Share",
    addDevice: "Add device",
    dashboardPortal: "Portal",
    viewAll: "View all",
    manageFamily: "Manage",
    lastPhoto: "Last photo",
    lastPhotoNever: "No photos yet",
    youLabel: "You",
    memberCanSend: "Can send photos",
    homeAssistant: "Home Assistant",
    homeAssistantDesc: "Local smart home control",
    connect: "Connect",
    copyInvite: "Copy invite code",
    inviteCopied: "Invite code copied",
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
    settingsSection: "设置",
    shareAction: "分享",
    addDevice: "添加设备",
    dashboardPortal: "门户",
    viewAll: "查看全部",
    manageFamily: "管理",
    lastPhoto: "最近照片",
    lastPhotoNever: "暂无照片",
    youLabel: "你",
    memberCanSend: "可发送照片",
    homeAssistant: "Home Assistant",
    homeAssistantDesc: "本地智能家居控制",
    connect: "连接",
    copyInvite: "复制邀请码",
    inviteCopied: "邀请码已复制",
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
  const [playlistEdit, setPlaylistEdit] = useState<Record<string, { title: string; scheduleRule: string }>>({});
  const [savingPlaylistId, setSavingPlaylistId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string>("");

  const load = useCallback(async () => {
    setErr(false);
    try {
      const res = await fetch("/api/home", { cache: "no-store", credentials: "include" });
      if (!res.ok) throw new Error("bad");
      const j = (await res.json()) as DashboardPayload;
      setData(j);
      const next: Record<string, { title: string; scheduleRule: string }> = {};
      for (const p of j.playlists ?? []) {
        next[p.id] = { title: p.title, scheduleRule: p.scheduleRule ?? "" };
      }
      setPlaylistEdit(next);
    } catch {
      setErr(true);
    }
  }, []);

  useEffect(() => {
    // Initial dashboard fetch hydrates local UI state from the backend.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const savePlaylist = async (playlistId: string) => {
    const ed = playlistEdit[playlistId];
    if (!ed) return;
    setSavingPlaylistId(playlistId);
    setNotice("");
    try {
      const res = await fetch(`/api/user/playlists/${encodeURIComponent(playlistId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: ed.title, scheduleRule: ed.scheduleRule.trim() || null }),
      });
      if (!res.ok) throw new Error("save_failed");
      setNotice("Playlist saved.");
      await load();
    } catch {
      setNotice("Could not save playlist.");
    } finally {
      setSavingPlaylistId(null);
    }
  };

  const navPrimary = useMemo(
    () =>
      [
        { id: "overview" as const, icon: "fa-house", label: t.overview },
        { id: "devices" as const, icon: "fa-tablet-screen-button", label: t.devices },
        { id: "photos" as const, icon: "fa-image", label: t.photos },
        { id: "playlist" as const, icon: "fa-list", label: t.playlist },
        { id: "integrations" as const, icon: "fa-plug", label: t.integrations },
      ] as const,
    [t],
  );

  const stats = data?.stats;
  const user = data?.user;
  const isPro = user?.subscriptionTier === "pro";

  return (
    <div className="flex min-h-[calc(100vh-0px)] w-full bg-[#FAFAFA] text-[#1A1A1A]">
      <aside className="fixed left-0 top-0 z-30 flex h-screen w-[260px] flex-col bg-[#DC2626] text-white shadow-lg">
        <div className="border-b border-white/20 px-6 py-6">
          <Link href={locale === "en" ? "/en" : `/${locale}`} className="inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/ra/logo.svg"
              alt="MyFrame"
              className="h-8 w-auto max-w-[180px] brightness-0 invert"
            />
          </Link>
          <p className="mt-3 text-xs text-white/70">{t.dashboardPortal}</p>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navPrimary.map((item) => (
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
          <p className="px-4 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-wider text-white/40">{t.settingsSection}</p>
          <button
            type="button"
            onClick={() => setScreen("settings")}
            className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-[15px] font-medium transition ${
              screen === "settings" ? "bg-white/20 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            <i className="fa-solid fa-gear w-5 text-center" aria-hidden />
            {t.settings}
          </button>
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
              <h1 className="text-[30px] font-bold tracking-tight">{t.overview}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`${base}/family`}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                >
                  <i className="fa-solid fa-share-nodes" aria-hidden />
                  {t.shareAction}
                </Link>
                {data?.familyInviteCode ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                    onClick={() => {
                      void navigator.clipboard.writeText(data.familyInviteCode!);
                      setNotice(t.inviteCopied);
                    }}
                  >
                    <i className="fa-solid fa-link" aria-hidden />
                    {t.copyInvite}
                  </button>
                ) : null}
                <Link
                  href={`${base}/send`}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#DC2626] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(220,38,38,0.22)] hover:bg-[#B91C1C]"
                >
                  <i className="fa-solid fa-plus" aria-hidden />
                  {t.addDevice}
                </Link>
                <button
                  type="button"
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50"
                  onClick={() => void load()}
                >
                  Refresh
                </button>
              </div>
            </header>
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard icon="fa-mobile-screen" label={t.activeDevices} value={String(stats?.activeDevices ?? 0)} />
              <StatCard icon="fa-users" label={t.familyMembersCount} value={String(stats?.familyMembers ?? 0)} />
              <StatCard icon="fa-camera" label={t.photosMonth} value={String(stats?.photosThisMonth ?? 0)} />
              <StatCard icon="fa-wand-magic-sparkles" label={t.aiGen} value={String(stats?.aiGenerated ?? 0)} />
            </div>
            <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
              <div className="space-y-6">
                <section className="rounded-2xl bg-white p-6 shadow-[0_10px_24px_rgba(17,24,39,0.08)]">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">{t.myDevices}</h2>
                  <button
                    type="button"
                    onClick={() => setScreen("devices")}
                    className="text-sm font-semibold text-[#DC2626] hover:underline"
                  >
                    {t.viewAll}
                  </button>
                </div>
                <ul className="space-y-4">
                  {(data?.devices ?? []).slice(0, 4).map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center gap-4 rounded-xl border border-transparent bg-[#fafafa] p-4 transition hover:border-[#fecaca]"
                    >
                      <div className="flex h-14 w-[4.6rem] shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-red-50 to-[#fecaca] text-[#DC2626]">
                        <i className="fa-solid fa-tablet-screen-button text-xl" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{d.name ?? d.id}</p>
                        <p className="text-xs text-gray-500">
                          {d.lastPhotoAtMs
                            ? `${t.lastPhoto}: ${formatRelativeTime(d.lastPhotoAtMs, langUi)}`
                            : t.lastPhotoNever}
                        </p>
                      </div>
                      <span
                        className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                          d.online ? "bg-[#e8ffe8] text-emerald-700" : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        <span className={`h-2 w-2 rounded-full ${d.online ? "bg-emerald-500" : "bg-gray-400"}`} />
                        {d.online ? t.online : t.offline}
                      </span>
                    </li>
                  ))}
                  {!data?.devices?.length && <li className="text-sm text-gray-500">—</li>}
                </ul>
              </section>
                <section className="rounded-2xl bg-white p-6 shadow-[0_10px_24px_rgba(17,24,39,0.08)]">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold">{t.recentPhotos}</h2>
                    <Link href={`${base}/send`} className="text-sm font-semibold text-[#DC2626] hover:underline">
                      Upload
                    </Link>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    {(data?.recentPhotos ?? []).slice(0, 8).map((p) => (
                      <div key={p.id} className="overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.thumbUrl} alt="" className="aspect-square w-full object-cover" />
                      </div>
                    ))}
                    {!data?.recentPhotos?.length && <p className="col-span-4 text-sm text-gray-500">—</p>}
                  </div>
                </section>
              </div>
              <div className="space-y-6">
                <section className="rounded-2xl bg-white p-6 shadow-[0_10px_24px_rgba(17,24,39,0.08)]">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold">{t.familyMembers}</h2>
                    <Link href={`${base}/family`} className="text-sm font-semibold text-[#DC2626] hover:underline">
                      {t.manageFamily}
                    </Link>
                  </div>
                  <ul className="space-y-3">
                    {(data?.familyMembers ?? []).map((m, idx) => (
                      <li key={m.userId} className="flex items-center gap-3 rounded-xl bg-[#fafafa] p-3">
                        <MemberAvatar index={idx} name={m.name} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">{m.name}</p>
                          <p className="text-xs text-gray-500">{m.isSelf ? t.youLabel : t.memberCanSend}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${memberRoleBadge(m.role)}`}>
                          {m.role}
                        </span>
                      </li>
                    ))}
                    {!data?.familyMembers?.length && <li className="text-sm text-gray-500">—</li>}
                  </ul>
                </section>
                <section className="rounded-2xl bg-white p-6 shadow-[0_10px_24px_rgba(17,24,39,0.08)]">
                  <h2 className="mb-4 text-lg font-semibold">{t.activity}</h2>
                  <ul className="max-h-[28rem] space-y-3 overflow-auto">
                    {(data?.activity ?? []).slice(0, 8).map((a) => {
                      const ic = activityIconKind(a.kind);
                      return (
                        <li key={a.id} className="flex items-start gap-3">
                          <span
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${ic.bg} ${ic.color}`}
                          >
                            <i className={`fa-solid ${ic.icon} text-sm`} aria-hidden />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium leading-snug">{a.label}</p>
                          </div>
                          <span className="shrink-0 text-xs text-gray-400">{formatRelativeTime(a.atMs, langUi)}</span>
                        </li>
                      );
                    })}
                    {!data?.activity?.length && <li className="text-sm text-gray-500">—</li>}
                  </ul>
                </section>
              </div>
            </div>
          </div>
        )}

        {screen === "devices" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-3xl font-bold">{t.devices}</h1>
              <Link href={`${base}/send`} className="rounded-xl bg-[#DC2626] px-4 py-2 text-sm font-semibold text-white">
                <i className="fa-solid fa-plus mr-2" />
                {t.addDevice}
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard icon="fa-tablet-screen-button" label={t.activeDevices} value={String(stats?.activeDevices ?? 0)} />
              <StatCard icon="fa-circle-check" label={t.online} value={String(stats?.onlineDevices ?? 0)} />
              <StatCard icon="fa-users" label={t.familyMembersCount} value={String(stats?.familyMembers ?? 0)} />
            </div>
            {!isPro && (
              <div className="rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 p-6 text-white shadow-lg">
                <p className="font-semibold">{t.proBanner}</p>
              </div>
            )}
            <div className="grid gap-4 lg:grid-cols-3">
              {(data?.devices ?? []).map((d) => (
                <article key={d.id} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-md lg:col-span-2">
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
                  <p className="mt-2 text-xs text-gray-500">
                    Last seen: {d.lastSeenAtMs ? new Date(d.lastSeenAtMs).toLocaleString() : "—"} · Wi-Fi: {d.wifiStatus}
                    {d.batteryPct != null ? ` · Battery ${d.batteryPct}%` : ""}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                    <MiniMetric label="Battery" value={d.batteryPct != null ? `${d.batteryPct}%` : "N/A"} />
                    <MiniMetric label="Connection" value={d.wifiStatus || "N/A"} />
                    <MiniMetric label="Last photo" value={d.lastSeenAtMs ? "recent" : "unknown"} />
                    <MiniMetric label="Photos shown" value={String(d.slideshowImageCount)} />
                  </div>
                  <h4 className="mt-5 text-sm font-semibold">Widgets</h4>
                  <div className="mt-2 space-y-2">
                    <WidgetRow icon="fa-cloud-sun" title="Weather" subtitle="images here · weather widget placeholder" />
                    <WidgetRow icon="fa-calendar" title="Date & Time" subtitle="images here · clock widget placeholder" />
                  </div>
                  <p className="mt-4 text-xs text-gray-400">{t.deviceSettingsPlaceholder}</p>
                </article>
              ))}
              <aside className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-md">
                <h3 className="text-base font-semibold">Quick Actions</h3>
                <div className="space-y-2">
                  <ActionGhost href={`${base}/send`} icon="fa-paper-plane" label="Send Photo" />
                  <ActionGhost onClick={() => void load()} icon="fa-rotate" label="Refresh Display" />
                  <ActionGhost icon="fa-gear" label="Device Settings (placeholder)" />
                  <ActionGhost icon="fa-clock-rotate-left" label="View History (placeholder)" />
                </div>
                <div className="border-t pt-4">
                  <h4 className="mb-2 text-sm font-semibold">Active Playlist</h4>
                  {(data?.playlists ?? []).slice(0, 2).map((p) => (
                    <div key={p.id} className="mb-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                      <p className="font-semibold">{p.title}</p>
                      <p className="text-xs text-gray-500">{p.photoIds.length} photos · {p.scheduleRule || "daily"}</p>
                    </div>
                  ))}
                  {!data?.playlists?.length && <p className="text-xs text-gray-500">images here · active playlist placeholder</p>}
                </div>
              </aside>
              {!data?.devices?.length && <p className="text-sm text-gray-500 lg:col-span-3">No devices yet. Pair one from the Send tab.</p>}
            </div>
          </div>
        )}

        {screen === "photos" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-3xl font-bold">{t.photos}</h1>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-semibold"
                  onClick={() => setScreen("playlist")}
                >
                  <i className="fa-solid fa-list mr-2" /> Playlists
                </button>
                <Link href={`${base}/send`} className="rounded-xl bg-[#DC2626] px-3 py-2 text-sm font-semibold text-white">
                  <i className="fa-solid fa-cloud-arrow-up mr-2" /> Upload
                </Link>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              Recent uploads and AI-generated images synced from your account.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs">
                <i className="fa-solid fa-table-cells" />
              </button>
              <button type="button" className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs">
                <i className="fa-solid fa-list" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              {(data?.recentPhotos ?? []).map((p) => (
                <div key={p.id} className="overflow-hidden rounded-xl border bg-white shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.thumbUrl} alt="" className="aspect-square w-full object-cover" />
                  <div className="border-t bg-white px-2 py-1 text-[11px] text-gray-500">{new Date(p.atMs).toLocaleDateString()}</div>
                </div>
              ))}
              {!data?.recentPhotos?.length && <p className="text-sm text-gray-500">No photos yet.</p>}
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
            <p className="text-xs text-gray-500">images here · AI generated gallery placeholder slots</p>
          </div>
        )}

        {screen === "playlist" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-3xl font-bold">{t.playlist}</h1>
              <button type="button" className="rounded-xl bg-[#DC2626] px-4 py-2 text-sm font-semibold text-white">
                <i className="fa-solid fa-plus mr-2" /> Create Playlist
              </button>
            </div>
            {notice ? <p className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">{notice}</p> : null}
            {(data?.playlists ?? []).map((p) => {
              const ed = playlistEdit[p.id] ?? { title: p.title, scheduleRule: p.scheduleRule ?? "" };
              return (
                <div key={p.id} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-md">
                  <p className="text-xs text-gray-400">{p.system ? "System" : "Custom"}</p>
                  <input
                    className="mt-2 w-full rounded-lg border px-3 py-2 text-lg font-semibold"
                    value={ed.title}
                    disabled={p.system}
                    onChange={(e) => setPlaylistEdit((s) => ({ ...s, [p.id]: { ...ed, title: e.target.value } }))}
                  />
                  <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-gray-500">Schedule Rule</label>
                  <input
                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    value={ed.scheduleRule}
                    disabled={p.system}
                    placeholder="e.g. daily@08:00"
                    onChange={(e) => setPlaylistEdit((s) => ({ ...s, [p.id]: { ...ed, scheduleRule: e.target.value } }))}
                  />
                  <p className="mt-3 text-sm text-gray-600">
                    {p.photoIds.length} photos · Frames: {p.assignedFrameIds.join(", ") || "—"}
                  </p>
                  {!p.system && (
                    <button
                      type="button"
                      disabled={savingPlaylistId === p.id}
                      className="mt-4 rounded-xl bg-[#DC2626] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                      onClick={() => void savePlaylist(p.id)}
                    >
                      {savingPlaylistId === p.id ? "Saving..." : t.savePlaylist}
                    </button>
                  )}
                </div>
              );
            })}
            {!data?.playlists?.length && <p className="text-gray-500">{t.noPlaylist}</p>}
            <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-md">
              <h3 className="text-lg font-semibold">Frame Widgets</h3>
              <div className="mt-3 space-y-2">
                <WidgetRow icon="fa-cloud-sun" title="Weather" subtitle="show weather on frame · placeholder connected view" />
                <WidgetRow icon="fa-calendar" title="Date & Time" subtitle="show current date/time · placeholder" />
                <WidgetRow icon="fa-cake-candles" title="Birthday Reminder" subtitle="placeholder" />
                <WidgetRow icon="fa-newspaper" title="Daily News" subtitle="placeholder" />
              </div>
            </section>
          </div>
        )}

        {screen === "integrations" && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold">{t.integrations}</h1>
            <p className="text-sm text-gray-600">{t.connectServices}</p>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <IntegrationCard on={data?.integrations?.wechatConnected} label="WeChat" />
              <IntegrationCard on={data?.integrations?.googlePhotosConnected} label="Google Photos" />
              <IntegrationCard on={data?.integrations?.icloudConnected} label="iCloud" />
              <HomeAssistantCard label={t.homeAssistant} desc={t.homeAssistantDesc} connectLabel={t.connect} />
            </div>
            <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-md">
              <h3 className="text-lg font-semibold">API Access</h3>
              <p className="mt-2 text-sm text-gray-600">
                Use the API to build custom integrations. Backend token-based access is active.
              </p>
              <pre className="mt-3 overflow-x-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-700">
https://api.myframe.app/v1/frames/{"{id}"}/send
              </pre>
              <button type="button" className="mt-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold">
                <i className="fa-solid fa-key mr-2" /> Manage API Keys
              </button>
              <p className="mt-2 text-xs text-gray-500">images here · API keys panel placeholder</p>
            </section>
          </div>
        )}

        {screen === "settings" && (
          <div className="space-y-6">
            <h1 className="text-3xl font-bold">{t.settings}</h1>
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="rounded-2xl border bg-white p-6 shadow-md lg:col-span-2">
                <h3 className="text-lg font-semibold">Account</h3>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between border-b pb-3">
                    <div>
                      <dt className="text-gray-500">Email</dt>
                      <dd className="font-medium">{user?.email}</dd>
                    </div>
                    <button type="button" className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold">Change</button>
                  </div>
                  <div className="flex items-center justify-between border-b pb-3">
                    <div>
                      <dt className="text-gray-500">Password</dt>
                      <dd className="font-medium">Last changed: placeholder</dd>
                    </div>
                    <button type="button" className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold">Update</button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <dt className="text-gray-500">Two-Factor Auth (SMS)</dt>
                      <dd className="font-medium text-emerald-700">Enabled · placeholder</dd>
                    </div>
                    <button type="button" className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold">Manage</button>
                  </div>
                </dl>
                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    onClick={() => void load()}
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-[#DC2626] px-3 py-2 text-sm font-semibold text-white"
                    onClick={async () => {
                      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
                      window.location.href = `/${locale}/auth`;
                    }}
                  >
                    Logout
                  </button>
                </div>
              </div>
              <aside className="rounded-2xl border bg-white p-6 shadow-md">
                <h3 className="text-lg font-semibold">Subscription</h3>
                <div className="mt-3 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 p-4 text-white">
                  <p className="text-sm font-semibold">{isPro ? "PRO Plan" : "Free Plan"}</p>
                  <p className="text-xs opacity-90">AI image generation + more online storage</p>
                </div>
                <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                  Theme: {data?.preferences?.theme || "default"}<br />
                  Auto-rotate: {data?.preferences?.autoRotateMinutes ?? "—"} min<br />
                  Auto-sync: {data?.preferences?.autoSync ? "Enabled" : "Disabled"}
                </div>
                <button type="button" className="mt-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold">
                  Manage Subscription
                </button>
                <p className="mt-2 text-xs text-gray-500">images here · billing/history placeholder</p>
              </aside>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function formatRelativeTime(atMs: number, lang: "en" | "zh"): string {
  const diff = Date.now() - atMs;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return lang === "zh" ? "刚刚" : "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return lang === "zh" ? `${min} 分钟前` : `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return lang === "zh" ? `${hr} 小时前` : `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return lang === "zh" ? `${day} 天前` : `${day}d ago`;
}

function activityIconKind(kind: string): { icon: string; bg: string; color: string } {
  if (/ai|magic|generated/i.test(kind)) {
    return { icon: "fa-wand-magic-sparkles", bg: "bg-violet-100", color: "text-violet-700" };
  }
  if (/voice|mic/i.test(kind)) {
    return { icon: "fa-microphone", bg: "bg-amber-100", color: "text-amber-700" };
  }
  if (/photo|image|upload/i.test(kind)) {
    return { icon: "fa-image", bg: "bg-red-100", color: "text-[#DC2626]" };
  }
  return { icon: "fa-bell", bg: "bg-gray-100", color: "text-gray-600" };
}

function memberRoleBadge(role: string): string {
  const r = role.toLowerCase();
  if (r.includes("owner")) return "bg-violet-100 text-violet-800";
  if (r.includes("admin")) return "bg-emerald-100 text-emerald-800";
  return "bg-gray-100 text-gray-700";
}

const memberAvatarColors = ["bg-[#DC2626]", "bg-emerald-600", "bg-amber-500", "bg-violet-600", "bg-sky-600"];

function MemberAvatar({ index, name }: { index: number; name: string }) {
  const bg = memberAvatarColors[index % memberAvatarColors.length];
  return (
    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white ${bg}`}>
      {(name || "?").slice(0, 1).toUpperCase()}
    </div>
  );
}

function HomeAssistantCard({ label, desc, connectLabel }: { label: string; desc: string; connectLabel: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#DC2626] text-white">
          <i className="fa-solid fa-house-chimney" aria-hidden />
        </span>
        <div>
          <p className="font-semibold">{label}</p>
          <p className="text-sm text-gray-500">{desc}</p>
        </div>
      </div>
      <button type="button" className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700">
        {connectLabel}
      </button>
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

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-2">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-800">{value}</p>
    </div>
  );
}

function WidgetRow({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-red-50 text-[#DC2626]">
          <i className={`fa-solid ${icon}`} />
        </span>
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">On</span>
    </div>
  );
}

function ActionGhost({ href, icon, label, onClick }: { href?: string; icon: string; label: string; onClick?: () => void }) {
  const cls =
    "flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50";
  if (href) {
    return (
      <Link href={href} className={cls}>
        <i className={`fa-solid ${icon}`} /> {label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      <i className={`fa-solid ${icon}`} /> {label}
    </button>
  );
}

function IntegrationCard({ on, label }: { on?: boolean; label: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-semibold">{label}</p>
        <Badge on={on} label={on ? "Connected" : "Not connected"} />
      </div>
      <p className="text-sm text-gray-500">
        {on ? "Connection is active." : "Connect this service from mobile app onboarding flow."}
      </p>
    </div>
  );
}
