"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { getAppStrings } from "@/lib/i18n-app";

type FamilyPayload = {
  ok: boolean;
  familyName?: string;
  inviteCode?: string;
  members?: Array<{ userId: string; name: string; email: string; role: string }>;
  error?: string;
};

export function FamilyView({ locale }: { locale: Locale }) {
  const t = getAppStrings(locale).family;
  const base = `/${locale}/app`;
  const [data, setData] = useState<FamilyPayload | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;

    async function loadMembers() {
      try {
        const res = await fetch("/api/family/members", { cache: "no-store", credentials: "include" });
        const j = (await res.json()) as FamilyPayload;
        if (active) setData(j);
      } catch {
        if (active) setData({ ok: false, error: "load_failed" });
      }
    }

    void loadMembers();
    return () => {
      active = false;
    };
  }, []);

  const copyInvite = () => {
    const code = data?.inviteCode;
    if (!code) {
      setNotice(locale === "zh" ? "暂无邀请码" : "No invite code yet.");
      return;
    }
    void navigator.clipboard.writeText(code);
    setNotice(locale === "zh" ? "邀请码已复制" : "Invite code copied.");
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <header className="border-b border-gray-200 bg-white px-4 py-4 shadow-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <h1 className="text-xl font-bold">{t.title}</h1>
          <Link href={`${base}/home`} className="text-sm font-semibold text-[#DC2626] hover:underline">
            {locale === "zh" ? "返回门户" : "Back to portal"}
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <p className="text-gray-700">{t.body}</p>

        {data?.ok && data.inviteCode ? (
          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-semibold text-gray-800">{locale === "zh" ? "邀请码" : "Invite code"}</p>
            <p className="mt-2 font-mono text-lg tracking-widest text-[#DC2626]">{data.inviteCode}</p>
            <p className="mt-2 text-xs text-gray-500">
              {locale === "zh" ? "分享给家人，让他们加入你的家庭组。" : "Share with family so they can join your group."}
            </p>
          </section>
        ) : null}

        {notice ? <p className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">{notice}</p> : null}

        <button
          type="button"
          className="w-full rounded-xl bg-[#DC2626] py-3 font-semibold text-white shadow"
          onClick={copyInvite}
        >
          {t.invite}
        </button>
        <Link
          href={`${base}/home`}
          className="block w-full rounded-xl border border-gray-300 bg-white py-3 text-center font-semibold"
        >
          {t.frames}
        </Link>

        {data?.members?.length ? (
          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              {data.familyName ?? (locale === "zh" ? "家庭成员" : "Members")}
            </h2>
            <ul className="divide-y divide-gray-100">
              {data.members.map((m) => (
                <li key={m.userId} className="flex items-center justify-between py-3 text-sm">
                  <span className="font-medium">{m.name}</span>
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold capitalize text-[#DC2626]">
                    {m.role}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {data && !data.ok ? (
          <p className="text-sm text-amber-800">
            {locale === "zh" ? "尚未加入家庭组。在门户概览中复制邀请码或创建家庭。" : "No family group yet. Copy an invite from the portal or create one in the app."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
