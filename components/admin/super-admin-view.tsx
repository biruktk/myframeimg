"use client";

import { useCallback, useEffect, useState } from "react";

type Overview = {
  totalUploads: number;
  totalFaqs: number;
  photoCount: number;
  lastPhotoAtMs: number | null;
  connected: boolean;
  deviceId: string;
  deviceSn: string;
  usedBytes: number;
  capacityBytes: number;
};

type Faq = {
  id: string;
  question: string;
  answer: string;
  updatedAtMs: number;
};

type FleetOverview = {
  totalFrames: number;
  onlineNow: number;
  offline: number;
  neverProvisioned: number;
  dailyActiveFrames: number;
  firmwareDistribution: Record<string, number>;
};

type AdminUser = {
  id: string;
  email: string;
  name: string;
  subscriptionTier: string;
  status: string;
  createdAtMs: number;
  lastSeenAtMs: number | null;
  frames: Array<{ id: string; bleMac: string; wifiStatus: string }>;
};

type AdminFrame = {
  id: string;
  bleMac: string;
  ownerUserId: string;
  wifiStatus: string;
  firmwareVersion: string;
  lastSeenAtMs: number | null;
  photoQueueDepth: number;
};

type ContentOps = {
  queue: { total: number; stuck: number };
  storageByUser: Array<{ userId: string; email: string; bytes: number }>;
  featureFlags: Record<string, { enabled: boolean; tier: string }>;
  auditLog: Array<{ id: string; actor: string; action: string; target: string; atMs: number }>;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; data?: T; status: number }> {
  try {
    const res = await fetch(path, { cache: "no-store", ...init });
    if (!res.ok) return { ok: false, status: res.status };
    const data = (await res.json()) as T;
    return { ok: true, data, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

export function SuperAdminView() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [user, setUser] = useState("admin");
  const [pass, setPass] = useState("admin");
  const [authError, setAuthError] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [fleet, setFleet] = useState<FleetOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [frames, setFrames] = useState<AdminFrame[]>([]);
  const [ops, setOps] = useState<ContentOps | null>(null);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [userSearchInput, setUserSearchInput] = useState("");
  const [userSearchApplied, setUserSearchApplied] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const [saving, setSaving] = useState(false);

  const loadCore = useCallback(async () => {
    if (!authed) return;
    setLoading(true);
    const failed: string[] = [];
    const qParam = encodeURIComponent(userSearchApplied.trim());
    const [oRes, fRes] = await Promise.all([
      fetchJson<Overview>("/api/admin/overview"),
      fetchJson<Faq[]>("/api/admin/faqs"),
    ]);
    if (oRes.ok && oRes.data) setOverview(oRes.data);
    else failed.push(`overview (${oRes.status})`);
    if (fRes.ok && fRes.data) setFaqs(fRes.data);
    else failed.push(`faqs (${fRes.status})`);

    const [fleetRes, userRes, frameRes, opsRes] = await Promise.all([
      fetchJson<FleetOverview>("/api/admin/fleet/overview"),
      fetchJson<AdminUser[]>(qParam ? `/api/admin/users?q=${qParam}` : "/api/admin/users"),
      fetchJson<AdminFrame[]>("/api/admin/frames"),
      fetchJson<ContentOps>("/api/admin/content/ops"),
    ]);
    if (fleetRes.ok && fleetRes.data) setFleet(fleetRes.data);
    else failed.push(`fleet (${fleetRes.status})`);
    if (userRes.ok && Array.isArray(userRes.data)) setUsers(userRes.data);
    else failed.push(`users (${userRes.status})`);
    if (frameRes.ok && Array.isArray(frameRes.data)) setFrames(frameRes.data);
    else failed.push(`frames (${frameRes.status})`);
    if (opsRes.ok && opsRes.data) setOps(opsRes.data);
    else failed.push(`ops (${opsRes.status})`);

    setLoadFailed(failed);
    setLoading(false);
  }, [authed, userSearchApplied]);

  useEffect(() => {
    void (async () => {
      const r = await fetchJson<{ ok: boolean }>("/api/admin/session");
      setAuthed(r.ok && r.data?.ok === true);
    })();
  }, []);

  useEffect(() => {
    if (authed) void loadCore();
  }, [authed, loadCore]);

  async function createFaq() {
    if (!q.trim() || !a.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/faqs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q.trim(), answer: a.trim() }),
      });
      if (res.ok) {
        setQ("");
        setA("");
        await loadCore();
      }
    } finally {
      setSaving(false);
    }
  }

  async function updateFaq(id: string, question: string, answer: string) {
    await fetch(`/api/admin/faqs/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, answer }),
    });
    await loadCore();
  }

  async function deleteFaq(id: string) {
    await fetch(`/api/admin/faqs/${id}`, { method: "DELETE" });
    await loadCore();
  }

  async function setUserStatus(userId: string, status: "active" | "suspended" | "banned") {
    await fetch(`/api/admin/users/${encodeURIComponent(userId)}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await loadCore();
  }

  async function loginAdmin() {
    setAuthError("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: user, password: pass }),
    });
    if (!res.ok) {
      setAuthError("Invalid admin credentials");
      return;
    }
    setAuthed(true);
  }

  async function logoutAdmin() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthed(false);
  }

  if (authed === null) {
    return (
      <main className="mx-auto max-w-md p-6">
        <p className="text-gray-600">Checking admin session…</p>
      </main>
    );
  }

  if (!authed) {
    return (
      <main className="mx-auto max-w-md space-y-4 p-6">
        <h1 className="text-2xl font-bold">Admin Login</h1>
        <p className="text-sm text-gray-600">Use <code className="rounded bg-gray-100 px-1">admin/admin</code>.</p>
        <input
          value={user}
          onChange={(e) => setUser(e.target.value)}
          placeholder="Username"
          className="w-full rounded border px-3 py-2 text-sm"
        />
        <input
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          type="password"
          placeholder="Password"
          className="w-full rounded border px-3 py-2 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") void loginAdmin();
          }}
        />
        {authError ? <p className="text-sm text-red-700">{authError}</p> : null}
        <button
          type="button"
          className="rounded bg-gray-900 px-4 py-2 text-sm text-white"
          onClick={() => void loginAdmin()}
        >
          Login
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Superadmin Dashboard</h1>
          <p className="text-sm text-gray-600">FAQ, fleet, accounts, frames, uploads &amp; audit (requires ADMIN_TOKEN).</p>
        </div>
        <button
          type="button"
          className="rounded-lg border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
          onClick={() => loadCore()}
        >
          Refresh
        </button>
        <button
          type="button"
          className="rounded-lg border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50"
          onClick={() => void logoutAdmin()}
        >
          Logout
        </button>
      </header>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : loadFailed.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Some sections failed to load</p>
          <ul className="mt-2 list-inside list-disc">
            {loadFailed.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs">Set <code className="rounded bg-amber-100 px-1">ADMIN_TOKEN</code> and matching headers for the Next → API proxy.</p>
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Uploads" value={String(overview?.totalUploads ?? 0)} />
        <Stat label="FAQs" value={String(overview?.totalFaqs ?? 0)} />
        <Stat label="Photos sent" value={String(overview?.photoCount ?? 0)} />
        <Stat label="Device online" value={overview?.connected ? "Yes" : "No"} />
        <Stat label="Device SN" value={overview?.deviceSn ?? "—"} />
      </section>

      {fleet && (
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Fleet</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Total frames" value={String(fleet.totalFrames)} />
            <Stat label="Online" value={String(fleet.onlineNow)} />
            <Stat label="Offline" value={String(fleet.offline)} />
            <Stat label="Never provisioned" value={String(fleet.neverProvisioned)} />
          </div>
          <p className="mt-3 text-xs text-gray-500">Active last 24h: {fleet.dailyActiveFrames}</p>
          <div className="mt-2 text-xs text-gray-600">
            Firmware:{" "}
            {Object.entries(fleet.firmwareDistribution)
              .map(([v, c]) => `${v}×${c}`)
              .join(" · ") || "—"}
          </div>
        </section>
      )}

      {ops && (
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Content &amp; queue</h2>
          <p className="text-sm text-gray-700">
            Upload queue: {ops.queue.total} total, {ops.queue.stuck} not delivered to frame.
          </p>
          <h3 className="mt-4 text-sm font-semibold text-gray-800">Storage by user</h3>
          <ul className="mt-2 max-h-40 overflow-auto text-sm">
            {ops.storageByUser.map((r) => (
              <li key={r.userId} className="flex justify-between border-b border-gray-100 py-1">
                <span className="truncate pr-2">{r.email}</span>
                <span className="shrink-0 text-gray-600">{formatBytes(r.bytes)}</span>
              </li>
            ))}
          </ul>
          <h3 className="mt-4 text-sm font-semibold text-gray-800">Recent audit</h3>
          <ul className="mt-2 max-h-48 overflow-auto font-mono text-xs text-gray-700">
            {ops.auditLog.slice(0, 25).map((e) => (
              <li key={e.id} className="border-b border-gray-50 py-1">
                {new Date(e.atMs).toISOString()} — {e.actor} {e.action} {e.target}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Users</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            value={userSearchInput}
            onChange={(e) => setUserSearchInput(e.target.value)}
            placeholder="Search email / user id / frame id / MAC"
            className="min-w-[200px] flex-1 rounded border px-3 py-2 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") setUserSearchApplied(userSearchInput);
            }}
          />
          <button
            type="button"
            className="rounded bg-gray-900 px-4 py-2 text-sm text-white"
            onClick={() => setUserSearchApplied(userSearchInput)}
          >
            Search
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b text-xs text-gray-500">
                <th className="py-2 pr-2">Email</th>
                <th className="py-2 pr-2">User ID</th>
                <th className="py-2 pr-2">Name</th>
                <th className="py-2 pr-2">Tier</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2 pr-2">Created</th>
                <th className="py-2 pr-2">Last seen</th>
                <th className="py-2 pr-2">Frames</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-gray-100">
                  <td className="max-w-[200px] truncate py-2 pr-2">{u.email}</td>
                  <td className="font-mono text-xs py-2 pr-2">{u.id}</td>
                  <td className="py-2 pr-2">{u.name}</td>
                  <td className="py-2 pr-2">{u.subscriptionTier}</td>
                  <td className="py-2 pr-2">{u.status}</td>
                  <td className="py-2 pr-2 text-xs">{new Date(u.createdAtMs).toLocaleString()}</td>
                  <td className="py-2 pr-2 text-xs">{u.lastSeenAtMs ? new Date(u.lastSeenAtMs).toLocaleString() : "—"}</td>
                  <td className="py-2 pr-2 text-xs text-gray-600">{u.frames.map((f) => f.id).join(", ") || "—"}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      {u.status !== "active" && (
                        <button
                          type="button"
                          className="rounded border border-green-600 px-2 py-0.5 text-xs text-green-800"
                          onClick={() => setUserStatus(u.id, "active")}
                        >
                          Activate
                        </button>
                      )}
                      {u.status !== "suspended" && (
                        <button
                          type="button"
                          className="rounded border border-amber-600 px-2 py-0.5 text-xs text-amber-900"
                          onClick={() => setUserStatus(u.id, "suspended")}
                        >
                          Suspend
                        </button>
                      )}
                      {u.status !== "banned" && (
                        <button
                          type="button"
                          className="rounded border border-red-600 px-2 py-0.5 text-xs text-red-800"
                          onClick={() => setUserStatus(u.id, "banned")}
                        >
                          Ban
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Frames</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b text-xs text-gray-500">
                <th className="py-2 pr-2">ID</th>
                <th className="py-2 pr-2">BLE MAC</th>
                <th className="py-2 pr-2">Wi‑Fi</th>
                <th className="py-2 pr-2">Firmware</th>
                <th className="py-2">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {frames.map((f) => (
                <tr key={f.id} className="border-b border-gray-100">
                  <td className="py-2 pr-2 font-mono text-xs">{f.id}</td>
                  <td className="py-2 pr-2 font-mono text-xs">{f.bleMac}</td>
                  <td className="py-2 pr-2">{f.wifiStatus}</td>
                  <td className="py-2 pr-2">{f.firmwareVersion}</td>
                  <td className="py-2 text-xs text-gray-600">
                    {f.lastSeenAtMs ? new Date(f.lastSeenAtMs).toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold">FAQ Management</h2>
        <div className="space-y-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Question"
            className="w-full rounded border px-3 py-2 text-sm"
          />
          <textarea
            value={a}
            onChange={(e) => setA(e.target.value)}
            placeholder="Answer"
            className="w-full rounded border px-3 py-2 text-sm"
            rows={3}
          />
          <button
            type="button"
            disabled={saving}
            onClick={() => createFaq()}
            className="rounded bg-red-600 px-4 py-2 text-white disabled:opacity-60"
          >
            {saving ? "Saving…" : "Add FAQ"}
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {faqs.map((f) => (
            <FaqRow key={f.id} faq={f} onSave={updateFaq} onDelete={deleteFaq} />
          ))}
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-white p-3 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

function FaqRow({
  faq,
  onSave,
  onDelete,
}: {
  faq: Faq;
  onSave: (id: string, q: string, a: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [q, setQ] = useState(faq.question);
  const [a, setA] = useState(faq.answer);
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded border border-gray-200 p-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} className="mb-2 w-full rounded border px-3 py-2 text-sm" />
      <textarea value={a} onChange={(e) => setA(e.target.value)} className="w-full rounded border px-3 py-2 text-sm" rows={3} />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-60"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave(faq.id, q.trim(), a.trim());
            } finally {
              setBusy(false);
            }
          }}
        >
          Save
        </button>
        <button
          type="button"
          className="rounded border px-3 py-1.5 text-sm disabled:opacity-60"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onDelete(faq.id);
            } finally {
              setBusy(false);
            }
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
