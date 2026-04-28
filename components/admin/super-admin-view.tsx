"use client";

import { useEffect, useState } from "react";

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

export function SuperAdminView() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    const [oRes, fRes] = await Promise.all([
      fetch("/api/admin/overview", { cache: "no-store" }),
      fetch("/api/admin/faqs", { cache: "no-store" }),
    ]);
    if (oRes.ok) setOverview((await oRes.json()) as Overview);
    if (fRes.ok) setFaqs((await fRes.json()) as Faq[]);
  }

  useEffect(() => {
    loadAll();
  }, []);

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
        await loadAll();
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
    await loadAll();
  }

  async function deleteFaq(id: string) {
    await fetch(`/api/admin/faqs/${id}`, { method: "DELETE" });
    await loadAll();
  }

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-2xl font-bold">Superadmin Dashboard</h1>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Uploads" value={String(overview?.totalUploads ?? 0)} />
        <Stat label="FAQs" value={String(overview?.totalFaqs ?? 0)} />
        <Stat label="Photos sent" value={String(overview?.photoCount ?? 0)} />
        <Stat label="Connected" value={overview?.connected ? "Yes" : "No"} />
        <Stat label="Device SN" value={overview?.deviceSn ?? "--"} />
      </section>
      <section className="rounded-xl border bg-white p-4">
        <h2 className="mb-2 text-lg font-semibold">FAQ Management</h2>
        <div className="space-y-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Question"
            className="w-full rounded border px-3 py-2"
          />
          <textarea
            value={a}
            onChange={(e) => setA(e.target.value)}
            placeholder="Answer"
            className="w-full rounded border px-3 py-2"
            rows={3}
          />
          <button
            onClick={createFaq}
            disabled={saving}
            className="rounded bg-red-600 px-4 py-2 text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Add FAQ"}
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
    <div className="rounded-xl border bg-white p-3">
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
    <div className="rounded border p-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} className="mb-2 w-full rounded border px-3 py-2" />
      <textarea value={a} onChange={(e) => setA(e.target.value)} className="w-full rounded border px-3 py-2" rows={3} />
      <div className="mt-2 flex gap-2">
        <button
          className="rounded bg-gray-900 px-3 py-1.5 text-white disabled:opacity-60"
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
          className="rounded border px-3 py-1.5"
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
