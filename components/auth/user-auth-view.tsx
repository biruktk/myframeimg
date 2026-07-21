"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";

export function UserAuthView({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setBusy(true);
    setErr("");
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload =
        mode === "login" ? { email: email.trim(), password } : { name: name.trim(), email: email.trim(), password };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(data?.error ?? "Authentication failed");
        return;
      }
      router.replace(`/${locale}/app/home`);
    } finally {
      setBusy(false);
    }
  }

  async function testLogin() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/auth/test-login", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const hint =
          data?.message ??
          (data?.error === "backend_unreachable"
            ? "API server is not running. In another terminal: cd web/backend && npm run dev"
            : null);
        setErr(hint ?? data?.error ?? "Test login failed");
        return;
      }
      router.replace(`/${locale}/app/home`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-myframe-soft px-4 py-10">
      <div className="mx-auto grid w-full max-w-5xl gap-6 md:grid-cols-2">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold">MyFrame Account</h1>
          <p className="mt-2 text-sm text-gray-600">Use the same account for app and web.</p>
        </section>
        <section className="space-y-4 rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex gap-2">
            <button
              type="button"
              className={`rounded px-3 py-1.5 text-sm ${mode === "login" ? "bg-gray-900 text-white" : "border"}`}
              onClick={() => setMode("login")}
            >
              Login
            </button>
            <button
              type="button"
              className={`rounded px-3 py-1.5 text-sm ${mode === "register" ? "bg-gray-900 text-white" : "border"}`}
              onClick={() => setMode("register")}
            >
              Create Account
            </button>
          </div>
          {mode === "register" && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className="w-full rounded border px-3 py-2 text-sm"
            />
          )}
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded border px-3 py-2 text-sm"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded border px-3 py-2 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy) void submit();
            }}
          />
          {err ? <p className="text-sm text-red-700">{err}</p> : null}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="w-full rounded bg-myframe-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Please wait…" : mode === "login" ? "Login" : "Create Account"}
          </button>
          <GoogleSignInButton locale={locale} disabled={busy} />
          <button
            type="button"
            onClick={() => void testLogin()}
            disabled={busy}
            className="w-full rounded border border-myframe-primary px-4 py-2 text-sm font-semibold text-myframe-primary disabled:opacity-60"
          >
            Test Login (No Credentials)
          </button>
        </section>
      </div>
    </main>
  );
}
