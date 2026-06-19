"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type FrameLogEntry = {
  id: string;
  atMs: number;
  direction: "rx" | "tx";
  mac: string;
  frameName: string | null;
  topic: string;
  action: string | null;
  payload: string;
};

function formatTime(atMs: number): string {
  const d = new Date(atMs);
  return d.toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }) +
    "." + String(d.getMilliseconds()).padStart(3, "0");
}

function dirColor(dir: "rx" | "tx"): string {
  return dir === "rx" ? "#5EDB9A" : "#6BA3FF";
}

type DevsStatus = {
  ok?: boolean;
  mqtt?: { connected?: boolean; brokerUrl?: string | null; connectedSinceMs?: number | null };
  messagesPerMin?: number;
  connectedClients?: number;
  registeredFrames?: number;
};

export function DevsLogConsole() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loginError, setLoginError] = useState("");
  const [logs, setLogs] = useState<FrameLogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<DevsStatus | null>(null);
  const [search, setSearch] = useState("");
  const [frameName, setFrameName] = useState("");
  const [mac, setMac] = useState("");
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const termRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (search.trim()) p.set("q", search.trim());
    if (frameName.trim()) p.set("name", frameName.trim());
    if (mac.trim()) p.set("mac", mac.trim());
    return p.toString();
  }, [search, frameName, mac]);

  const checkSession = useCallback(async () => {
    const res = await fetch("/api/admin/session", { cache: "no-store" });
    const data = (await res.json()) as { ok?: boolean };
    setAuthed(Boolean(data.ok));
  }, []);

  const loadInitial = useCallback(async () => {
    const qs = queryString ? `?${queryString}&limit=800` : "?limit=800";
    const res = await fetch(`/api/devs/logs${qs}`, { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { items?: FrameLogEntry[] };
    setLogs(data.items ?? []);
  }, [queryString]);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (!authed) return;
    void loadInitial();
  }, [authed, loadInitial]);

  useEffect(() => {
    if (!authed) return;
    const loadStatus = () => {
      void fetch("/api/devs/status", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.ok) setStatus(data as DevsStatus);
        });
    };
    loadStatus();
    const t = setInterval(loadStatus, 5000);
    return () => clearInterval(t);
  }, [authed]);

  useEffect(() => {
    if (!authed) return;
    const qs = queryString ? `?${queryString}` : "";
    const es = new EventSource(`/api/devs/logs/stream${qs}`);
    es.addEventListener("ready", () => setConnected(true));
    es.addEventListener("log", (ev) => {
      if (pausedRef.current) return;
      try {
        const entry = JSON.parse((ev as MessageEvent).data) as FrameLogEntry;
        setLogs((prev) => {
          const next = [...prev, entry];
          return next.length > 3000 ? next.slice(-3000) : next;
        });
      } catch {
        /* ignore */
      }
    });
    es.onerror = () => setConnected(false);
    return () => {
      es.close();
      setConnected(false);
    };
  }, [authed, queryString]);

  useEffect(() => {
    if (!autoScroll || !termRef.current) return;
    termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [logs, autoScroll]);

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
      <div className="devs-shell">
        <p className="devs-muted">Checking session…</p>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="devs-shell devs-login">
        <form className="devs-login-card" onSubmit={onLogin}>
          <h1>MyFrame Devs</h1>
          <p className="devs-muted">Live frame logs across the fleet. Admin sign-in required.</p>
          <label>
            Username
            <input name="username" autoComplete="username" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {loginError ? <p className="devs-error">{loginError}</p> : null}
          <div className="devs-login-actions">
            <button type="submit" className="devs-btn-primary">Sign in</button>
            <button type="button" className="devs-btn-secondary" onClick={() => void onTestLogin()}>
              Quick test login
            </button>
          </div>
          <p className="devs-login-hint">Test login uses admin / admin (local dev defaults)</p>
        </form>
      </div>
    );
  }

  return (
    <div className="devs-shell">
      <header className="devs-header">
        <div>
          <h1>Frame Log Console</h1>
          <p className="devs-muted">
            {connected ? "● Live stream" : "○ Reconnecting…"} · {logs.length} entries
            {status ? (
              <>
                {" · "}
                {status.messagesPerMin ?? 0} msg/min · {status.connectedClients ?? 0} online · MQTT{" "}
                {status.mqtt?.connected ? "connected" : "offline"}
                {status.mqtt?.brokerUrl ? ` (${status.mqtt.brokerUrl})` : ""}
              </>
            ) : null}
          </p>
        </div>
        <div className="devs-actions">
          <button type="button" onClick={() => setPaused((p) => !p)}>{paused ? "Resume" : "Pause"}</button>
          <button type="button" onClick={() => setAutoScroll((a) => !a)}>{autoScroll ? "Auto-scroll on" : "Auto-scroll off"}</button>
          <button type="button" onClick={() => setLogs([])}>Clear</button>
        </div>
      </header>

      <div className="devs-filters">
        <input
          placeholder="Search logs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <input
          placeholder="Filter by frame name"
          value={frameName}
          onChange={(e) => setFrameName(e.target.value)}
        />
        <input
          placeholder="Filter by MAC"
          value={mac}
          onChange={(e) => setMac(e.target.value)}
        />
      </div>

      <div className="devs-terminal" ref={termRef}>
        {logs.length === 0 ? (
          <div className="devs-empty">
            No frame traffic yet. Real logs appear when frames send MQTT messages (topics like /device/report/… and /inkjoyap/…) or when photos are pushed via the API.
          </div>
        ) : (
          logs.map((entry) => (
            <div key={entry.id} className="devs-line">
              <span className="devs-time">{formatTime(entry.atMs)}</span>
              <span className="devs-dir" style={{ color: dirColor(entry.direction) }}>
                {entry.direction.toUpperCase()}
              </span>
              <span className="devs-mac">{entry.mac}</span>
              {entry.frameName ? <span className="devs-name">{entry.frameName}</span> : null}
              <span className="devs-topic">{entry.topic}</span>
              {entry.action ? <span className="devs-action">{entry.action}</span> : null}
              <span className="devs-payload">{entry.payload}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
