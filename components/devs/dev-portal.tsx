"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { DevPortalApp } from "./dev-portal-app";

export function DevPortal() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loginError, setLoginError] = useState("");

  const checkSession = useCallback(async () => {
    const res = await fetch("/api/admin/session", { cache: "no-store" });
    const data = (await res.json()) as { ok?: boolean };
    setAuthed(Boolean(data.ok));
  }, []);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  async function onLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoginError("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: String(fd.get("username") ?? ""),
        password: String(fd.get("password") ?? ""),
      }),
    });
    if (!res.ok) {
      setLoginError("Invalid credentials");
      return;
    }
    setAuthed(true);
  }

  async function onTestLogin() {
    setLoginError("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "admin" }),
    });
    if (!res.ok) {
      setLoginError("Test login failed — is the backend running?");
      return;
    }
    setAuthed(true);
  }

  if (authed === null) {
    return (
      <div className="devs-portal min-h-screen bg-background text-foreground flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Checking session…</p>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="devs-portal min-h-screen bg-background text-foreground flex items-center justify-center p-5">
        <form className="w-full max-w-md bg-card border border-border rounded-2xl p-8 grid gap-3 shadow-lg" onSubmit={onLogin}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-500 rounded-lg flex items-center justify-center text-white text-sm font-bold">
              MF
            </div>
            <h1 className="text-xl font-semibold m-0">MyFrame Dev Portal</h1>
          </div>
          <p className="text-sm text-muted-foreground m-0 mb-2">
            API explorer, live frame logs, and fleet telemetry. Admin sign-in required.
          </p>
          <label className="grid gap-1.5 text-sm text-muted-foreground">
            Username
            <input
              name="username"
              autoComplete="username"
              required
              className="border border-border bg-secondary text-foreground rounded-lg px-3 py-2.5 text-sm"
            />
          </label>
          <label className="grid gap-1.5 text-sm text-muted-foreground">
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="border border-border bg-secondary text-foreground rounded-lg px-3 py-2.5 text-sm"
            />
          </label>
          {loginError ? <p className="text-red-400 text-sm m-0">{loginError}</p> : null}
          <div className="grid gap-2 pt-1">
            <button type="submit" className="py-2.5 bg-primary text-primary-foreground rounded-lg font-semibold text-sm hover:bg-primary/90">
              Sign in
            </button>
            <button
              type="button"
              className="py-2.5 bg-secondary border border-border rounded-lg font-semibold text-sm hover:bg-border"
              onClick={() => void onTestLogin()}
            >
              Quick test login (admin / admin)
            </button>
          </div>
        </form>
      </div>
    );
  }

  return <DevPortalApp />;
}
