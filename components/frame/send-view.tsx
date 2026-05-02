"use client";

import { useRef, useState } from "react";
import type { Locale } from "@/lib/i18n";
import { getAppStrings } from "@/lib/i18n-app";
import { sha256Hex } from "@/lib/sha256";

type Source =
  | "sd"
  | "gallery"
  | "camera"
  | "sharelink"
  | "ai"
  | "gift";

type SlideshowKey = "fade" | "kenBurns" | "grid" | "random";

const DEVICE_ID = process.env.NEXT_PUBLIC_DEVICE_ID ?? "YX-133P-001";

export function SendView({ locale }: { locale: Locale }) {
  const s = getAppStrings(locale).send;
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<Source | null>(null);
  const [transport, setTransport] = useState<"wifi" | "bluetooth">("wifi");
  const [slideshow, setSlideshow] = useState<SlideshowKey>("fade");
  const [pickedName, setPickedName] = useState<string | null>(null);

  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  function beginSend(source: Source) {
    setPending(source);
    setTransport("wifi");
    setSlideshow("fade");
    setBanner(null);
    setPickedName(null);
    setOpen(true);
  }

  function closeModal() {
    if (busy) return;
    setOpen(false);
    setPending(null);
    setPickedName(null);
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setPickedName(f?.name ?? null);
  }

  async function confirmSend() {
    if (pending == null) return;
    setBusy(true);
    setBanner(null);
    try {
      if (pending === "gallery" || pending === "camera") {
        const input = pending === "gallery" ? galleryInputRef.current : cameraInputRef.current;
        const file = input?.files?.[0];
        if (!file) {
          setBanner({ kind: "err", text: s.selectPhotoFirst });
          return;
        }
        const checksum = await sha256Hex(await file.arrayBuffer());
        const fd = new FormData();
        fd.append("file", file, file.name);
        fd.append("device_id", DEVICE_ID);
        fd.append("checksum", checksum);
        fd.append("size", String(file.size));
        fd.append("slideshow_style", slideshow);
        fd.append("transport", transport);
        const res = await fetch("/api/photo/upload", {
          method: "POST",
          body: fd,
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          received_bytes?: number;
          image_url?: string;
          stored_path?: string;
          frame_play_basename?: string;
        };
        if (!res.ok || data.ok === false) {
          setBanner({
            kind: "err",
            text: typeof data.error === "string" ? data.error : s.uploadError,
          });
          return;
        }
        const frameUrl =
          typeof data.image_url === "string" && data.image_url.length > 0
            ? data.image_url
            : typeof data.frame_play_basename === "string"
              ? `/frame-media/${encodeURIComponent(data.frame_play_basename)}`
              : "";
        const stored =
          typeof data.stored_path === "string" && data.stored_path.length > 0
            ? data.stored_path
            : "(unknown)";
        const okText =
          frameUrl.length > 0
            ? `${s.sent}\n${s.uploadOkDetails.replace("{stored}", stored).replace("{frameUrl}", frameUrl)}`
            : s.sent;
        setBanner({ kind: "ok", text: okText });
        setOpen(false);
        setPending(null);
        setPickedName(null);
        if (input) input.value = "";
        return;
      }

      const res = await fetch("/api/device/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: pending,
          transport,
          slideshow,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      setBanner({
        kind: data.ok === false ? "err" : "ok",
        text: data.message ?? (data.ok ? s.sent : s.uploadError),
      });
      setOpen(false);
      setPending(null);
    } catch {
      setBanner({ kind: "err", text: s.uploadError });
    } finally {
      setBusy(false);
    }
  }

  const slideshowOptions: { key: SlideshowKey; label: string }[] = [
    { key: "fade", label: s.fade },
    { key: "kenBurns", label: s.kenBurns },
    { key: "grid", label: s.grid },
    { key: "random", label: s.random },
  ];

  const rows: { source: Source; title: string; sub: string; pro?: boolean; highlight?: boolean }[] =
    [
      { source: "sd", title: s.sd, sub: s.sdSub },
      { source: "gallery", title: s.gallery, sub: s.gallerySub },
      { source: "camera", title: s.camera, sub: s.cameraSub },
      { source: "sharelink", title: s.shareLink, sub: s.shareLinkSub },
      { source: "ai", title: s.ai, sub: s.aiSub, pro: true, highlight: true },
      { source: "gift", title: s.gift, sub: s.giftSub },
    ];

  const needsPhoto = pending === "gallery" || pending === "camera";

  return (
    <div>
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFilePicked}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFilePicked}
      />

      <header className="bg-white px-4 py-3 shadow-sm">
        <h1 className="text-lg font-bold">{s.title}</h1>
      </header>
      <div className="space-y-3 p-4">
        {banner && (
          <p
            className={
              banner.kind === "ok"
                ? "rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900"
                : "rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900"
            }
          >
            {banner.text}
          </p>
        )}
        {rows.map((r) => (
          <button
            key={r.source}
            type="button"
            disabled={busy}
            onClick={() => beginSend(r.source)}
            className={`flex w-full items-center gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm ${
              r.highlight ? "border-myframe-primary" : "border-gray-200"
            }`}
          >
            <span className="text-2xl text-myframe-primary">
              {r.source === "sd" && "💾"}
              {r.source === "gallery" && "🖼"}
              {r.source === "camera" && "📷"}
              {r.source === "sharelink" && "🔗"}
              {r.source === "ai" && "✨"}
              {r.source === "gift" && "🎁"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-bold">{r.title}</span>
                {r.pro && (
                  <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-900">
                    {s.pro}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600">{r.sub}</p>
            </div>
            <span className="text-gray-400">›</span>
          </button>
        ))}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="send-modal-title"
        >
          <div className="w-full max-w-md rounded-t-3xl bg-white shadow-xl sm:rounded-3xl">
            <div className="border-b border-gray-100 px-4 py-3">
              <h2 id="send-modal-title" className="text-center text-base font-bold">
                {s.sendToFrame}
              </h2>
              <p className="text-center text-xs text-gray-500">{s.chooseTransport}</p>
            </div>
            <div className="space-y-5 px-4 py-4">
              {needsPhoto && (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3">
                  <p className="mb-2 text-center text-xs text-gray-600">{s.pickPhoto}</p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      pending === "gallery"
                        ? galleryInputRef.current?.click()
                        : cameraInputRef.current?.click()
                    }
                    className="w-full rounded-lg bg-white py-2 text-sm font-semibold text-myframe-primary shadow-sm ring-1 ring-gray-200"
                  >
                    {s.pickPhoto}
                  </button>
                  {pickedName && (
                    <p className="mt-2 truncate text-center text-xs text-gray-700">{pickedName}</p>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTransport("wifi")}
                  className={`rounded-2xl border-2 py-3 text-sm font-semibold ${
                    transport === "wifi"
                      ? "border-myframe-primary bg-red-50 text-myframe-primary"
                      : "border-gray-200 bg-white text-gray-700"
                  }`}
                >
                  {s.wifi}
                </button>
                <button
                  type="button"
                  onClick={() => setTransport("bluetooth")}
                  className={`rounded-2xl border-2 py-3 text-sm font-semibold ${
                    transport === "bluetooth"
                      ? "border-myframe-primary bg-red-50 text-myframe-primary"
                      : "border-gray-200 bg-white text-gray-700"
                  }`}
                >
                  {s.bluetooth}
                </button>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-gray-800">{s.slideshow}</p>
                <div className="flex flex-wrap gap-2">
                  {slideshowOptions.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => setSlideshow(o.key)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                        slideshow === o.key
                          ? "border-myframe-primary bg-myframe-primary text-white"
                          : "border-gray-200 bg-gray-50 text-gray-700"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={closeModal}
                  className="flex-1 rounded-xl border border-gray-300 py-3 text-sm font-semibold text-gray-700"
                >
                  {s.cancel}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void confirmSend()}
                  className="flex-1 rounded-xl bg-myframe-primary py-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy ? s.sending : s.confirmSend}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
