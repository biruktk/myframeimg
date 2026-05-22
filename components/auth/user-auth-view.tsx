"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/i18n";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { loginAction, registerAction, testLoginAction } from "@/app/actions/user-auth";

export function UserAuthView({ locale }: { locale: Locale }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  function afterAuth(result: Awaited<ReturnType<typeof testLoginAction>>) {
    if (result.ok) {
      router.replace(`/${locale}/app/home`);
      router.refresh();
      return;
    }
    setErr(result.message ?? result.error);
  }

  function submit() {
    setErr("");
    startTransition(async () => {
      const result =
        mode === "login"
          ? await loginAction(email, password)
          : await registerAction(name, email, password);
      afterAuth(result);
    });
  }

  function testLogin() {
    setErr("");
    startTransition(async () => {
      afterAuth(await testLoginAction());
    });
  }

  const busy = pending;

  return (
    <main className="min-h-screen bg-myframe-soft px-4 py-10">
      <div className="mx-auto grid w-full max-w-5xl gap-6 md:grid-cols-2">
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold">MyFrame Account</h1>
          <p className="mt-2 text-sm text-gray-600">Use the same account for app and web.</p>
          <p className="mt-3 text-xs text-gray-500">
            Test login creates a demo user and opens the portal (no password).
          </p>
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
            autoComplete="email"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded border px-3 py-2 text-sm"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy) submit();
            }}
          />
          {err ? <p className="text-sm text-red-700">{err}</p> : null}
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="w-full rounded bg-myframe-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Please wait…" : mode === "login" ? "Login" : "Create Account"}
          </button>
          <GoogleSignInButton locale={locale} disabled={busy} />
          <button
            type="button"
            onClick={testLogin}
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
