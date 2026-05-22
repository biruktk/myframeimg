"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Locale } from "@/lib/i18n";

const copy = {
  en: {
    title: "Add device",
    subtitle: "Link a MyFrame to your account. Use the ID printed on the frame or shown in the mobile app after pairing.",
    deviceId: "Device ID",
    deviceIdHint: "Example: YX-133P-001",
    bleMac: "Bluetooth MAC (optional)",
    displayName: "Display name (optional)",
    submit: "Add device",
    back: "Back to portal",
    success: "Device added. You can send photos from Send or the portal.",
    noDeviceId: "Enter a device ID.",
    failed: "Could not add device.",
    noDeviceYet: "Add a device before sending photos.",
  },
  zh: {
    title: "添加设备",
    subtitle: "将 MyFrame 绑定到您的账户。可使用机身标签上的 ID，或手机配对后显示的 ID。",
    deviceId: "设备 ID",
    deviceIdHint: "例如：YX-133P-001",
    bleMac: "蓝牙 MAC（可选）",
    displayName: "显示名称（可选）",
    submit: "添加设备",
    back: "返回门户",
    success: "设备已添加，可在「发送」或门户中传图。",
    noDeviceId: "请输入设备 ID。",
    failed: "无法添加设备。",
    noDeviceYet: "请先添加设备再发送照片。",
  },
};

export function AddDeviceView({ locale }: { locale: Locale }) {
  const router = useRouter();
  const lang = locale === "zh" ? "zh" : "en";
  const t = copy[lang];
  const portalHome = `/${locale}/app/home`;
  const [deviceId, setDeviceId] = useState("");
  const [bleMac, setBleMac] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const id = deviceId.trim();
    if (!id) {
      setErr(t.noDeviceId);
      return;
    }
    setBusy(true);
    setErr("");
    setOk("");
    try {
      const res = await fetch("/api/user/devices", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        credentials: "include",
        body: JSON.stringify({
          deviceId: id,
          bleMac: bleMac.trim() || undefined,
          displayName: displayName.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; message?: string } | null;
      if (!res.ok || !data?.ok) {
        const msg =
          data?.message ??
          (data?.error === "backend_unreachable"
            ? "API server is not reachable. Start backend: cd web/backend && npm run dev"
            : null);
        setErr(msg ?? data?.error ?? t.failed);
        return;
      }
      setOk(t.success);
      setTimeout(() => router.replace(portalHome), 1200);
    } catch {
      setErr(t.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <Link href={portalHome} className="text-sm font-semibold text-[#DC2626] hover:underline">
          ← {t.back}
        </Link>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-2 text-sm text-gray-600">{t.subtitle}</p>
      </div>

      <form onSubmit={(e) => void submit(e)} className="space-y-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-md">
        <label className="block text-sm font-semibold text-gray-800">
          {t.deviceId}
          <input
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            value={deviceId}
            onChange={(e) => setDeviceId(e.target.value)}
            placeholder={t.deviceIdHint}
            autoComplete="off"
            required
          />
        </label>
        <label className="block text-sm font-semibold text-gray-800">
          {t.bleMac}
          <input
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            value={bleMac}
            onChange={(e) => setBleMac(e.target.value)}
            placeholder="D0:CF:13:F0:16:1E"
            autoComplete="off"
          />
        </label>
        <label className="block text-sm font-semibold text-gray-800">
          {t.displayName}
          <input
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Living room frame"
            autoComplete="off"
          />
        </label>
        {err ? <p className="text-sm text-red-700">{err}</p> : null}
        {ok ? <p className="text-sm text-emerald-700">{ok}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-[#DC2626] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? "…" : t.submit}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500">
        <Link href={`/${locale}/app/send`} className="font-semibold text-[#DC2626] hover:underline">
          Send photos
        </Link>{" "}
        (after your device is added)
      </p>
    </div>
  );
}
