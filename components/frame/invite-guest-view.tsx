"use client";

import { useCallback, useEffect, useState } from "react";

import type { Locale } from "@/lib/i18n";

type InviteInfo = {
  ok: boolean;
  frameName?: string;
  frameMac?: string;
  inviteUrl?: string;
  error?: string;
};

type Props = {
  code: string;
  locale: Locale;
};

type InviteCopy = {
  title: string;
  lead: string;
  loading: string;
  invalid: string;
  connectionError: string;
  frameLabel: string;
  qrAlt: string;
  choosePhoto: string;
  sending: string;
  sentOnline: string;
  sentQueued: string;
  uploadFailed: string;
};

const copy: Record<Locale, InviteCopy> = {
  en: {
    title: "Send a photo",
    lead: "You were invited to send a picture to a MyFrame device. Choose a photo below.",
    loading: "Loading invite…",
    invalid: "This invite link is invalid or expired.",
    connectionError: "Could not load invite. Check your connection.",
    frameLabel: "Frame",
    qrAlt: "Invite QR code",
    choosePhoto: "Choose photo & send",
    sending: "Sending…",
    sentOnline: "Photo sent! It should appear on the frame shortly.",
    sentQueued: "Photo received! The frame will show it when online.",
    uploadFailed: "Upload failed. Please try again.",
  },
  zh: {
    title: "发送照片",
    lead: "你被邀请向 MyFrame 相框发送照片。请在下方选择一张照片。",
    loading: "正在加载邀请…",
    invalid: "此邀请链接无效或已过期。",
    connectionError: "无法加载邀请，请检查网络连接。",
    frameLabel: "相框",
    qrAlt: "邀请二维码",
    choosePhoto: "选择照片并发送",
    sending: "发送中…",
    sentOnline: "照片已发送！很快就会显示在相框上。",
    sentQueued: "照片已收到！相框上线后会显示。",
    uploadFailed: "上传失败，请重试。",
  },
  es: {
    title: "Enviar una foto",
    lead: "Te invitaron a enviar una foto a un dispositivo MyFrame. Elige una foto abajo.",
    loading: "Cargando invitación…",
    invalid: "Este enlace de invitación no es válido o ha caducado.",
    connectionError: "No se pudo cargar la invitación. Revisa tu conexión.",
    frameLabel: "Marco",
    qrAlt: "Código QR de invitación",
    choosePhoto: "Elegir foto y enviar",
    sending: "Enviando…",
    sentOnline: "¡Foto enviada! Debería aparecer en el marco en breve.",
    sentQueued: "¡Foto recibida! El marco la mostrará cuando esté en línea.",
    uploadFailed: "Error al subir. Inténtalo de nuevo.",
  },
  fr: {
    title: "Envoyer une photo",
    lead: "Vous êtes invité à envoyer une photo à un appareil MyFrame. Choisissez une photo ci-dessous.",
    loading: "Chargement de l'invitation…",
    invalid: "Ce lien d'invitation est invalide ou expiré.",
    connectionError: "Impossible de charger l'invitation. Vérifiez votre connexion.",
    frameLabel: "Cadre",
    qrAlt: "QR code d'invitation",
    choosePhoto: "Choisir une photo et envoyer",
    sending: "Envoi…",
    sentOnline: "Photo envoyée ! Elle devrait apparaître bientôt sur le cadre.",
    sentQueued: "Photo reçue ! Le cadre l'affichera une fois en ligne.",
    uploadFailed: "Échec de l'envoi. Veuillez réessayer.",
  },
  de: {
    title: "Foto senden",
    lead: "Du wurdest eingeladen, ein Foto an ein MyFrame-Gerät zu senden. Wähle unten ein Foto.",
    loading: "Einladung wird geladen…",
    invalid: "Dieser Einladungslink ist ungültig oder abgelaufen.",
    connectionError: "Einladung konnte nicht geladen werden. Prüfe deine Verbindung.",
    frameLabel: "Rahmen",
    qrAlt: "Einladungs-QR-Code",
    choosePhoto: "Foto wählen & senden",
    sending: "Wird gesendet…",
    sentOnline: "Foto gesendet! Es sollte bald auf dem Rahmen erscheinen.",
    sentQueued: "Foto empfangen! Der Rahmen zeigt es, wenn er online ist.",
    uploadFailed: "Upload fehlgeschlagen. Bitte erneut versuchen.",
  },
  ja: {
    title: "写真を送信",
    lead: "MyFrame デバイスへ写真を送るよう招待されました。下から写真を選んでください。",
    loading: "招待を読み込み中…",
    invalid: "この招待リンクは無効か期限切れです。",
    connectionError: "招待を読み込めません。接続を確認してください。",
    frameLabel: "フレーム",
    qrAlt: "招待 QR コード",
    choosePhoto: "写真を選んで送信",
    sending: "送信中…",
    sentOnline: "写真を送信しました！まもなくフレームに表示されます。",
    sentQueued: "写真を受け取りました！オンラインになると表示されます。",
    uploadFailed: "アップロードに失敗しました。もう一度お試しください。",
  },
};

const API_BASE =
  typeof window !== "undefined" &&
  ["myframe.ink", "www.myframe.ink", "localhost"].includes(window.location.hostname)
    ? ""
    : "http://47.76.164.162:3001";

export function InviteGuestView({ code, locale }: Props) {
  const t = copy[locale] ?? copy.en;
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/invite/${encodeURIComponent(code)}/info`);
        const data = (await res.json()) as InviteInfo;
        if (!cancelled) {
          if (!res.ok || !data.ok) {
            setError(t.invalid);
          } else {
            setInfo(data);
          }
        }
      } catch {
        if (!cancelled) setError(t.connectionError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, t.connectionError, t.invalid]);

  const onPickPhoto = useCallback(
    async (file: File | null) => {
      if (!file || !info?.ok) return;
      setUploading(true);
      setError(null);
      setMessage(null);
      const tryUpload = async (): Promise<{ ok?: boolean; error?: string; delivered_to_frame?: boolean }> => {
        const form = new FormData();
        form.append("photo", file, file.name || "photo.jpg");
        const res = await fetch(`${API_BASE}/api/invite/${encodeURIComponent(code)}/upload`, {
          method: "POST",
          body: form,
        });
        if (res.ok) return res.json();
        throw new Error("formdata_failed");
      };
      const tryUploadRaw = (): Promise<{ ok?: boolean; error?: string; delivered_to_frame?: boolean }> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const arrayBuffer = reader.result as ArrayBuffer;
            const blob = new Blob([arrayBuffer], { type: file.type || "image/jpeg" });
            const xhr = new XMLHttpRequest();
            xhr.open("POST", `${API_BASE}/api/invite/${encodeURIComponent(code)}/upload-raw`);
            xhr.setRequestHeader("Content-Type", file.type || "image/jpeg");
            xhr.onload = () => {
              try {
                resolve(JSON.parse(xhr.responseText));
              } catch {
                resolve({ ok: false, error: t.uploadFailed });
              }
            };
            xhr.onerror = () => reject(new Error("xhr_failed"));
            xhr.send(blob);
          };
          reader.onerror = () => reject(new Error("reader_failed"));
          reader.readAsArrayBuffer(file);
        });
      };
      try {
        let data = await tryUpload().catch(() => null);
        if (!data || !data.ok) {
          data = await tryUploadRaw();
        }
        if (!data || !data.ok) {
          setError(data?.error || t.uploadFailed);
          return;
        }
        setMessage(data.delivered_to_frame ? t.sentOnline : t.sentQueued);
      } catch {
        setError(t.uploadFailed);
      } finally {
        setUploading(false);
      }
    },
    [code, info?.ok, t.sentOnline, t.sentQueued, t.uploadFailed],
  );

  const qrSrc = `${API_BASE}/api/invite/${encodeURIComponent(code)}/qr`;

  return (
    <main
      lang={locale}
      style={{
        minHeight: "100vh",
        background: "#f5f5f5",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        padding: "24px 16px",
      }}
    >
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px", color: "#111" }}>{t.title}</h1>
        <p style={{ margin: "0 0 20px", color: "#666", fontSize: 14, lineHeight: 1.5 }}>{t.lead}</p>

        {loading && <p style={{ color: "#666" }}>{t.loading}</p>}

        {!loading && error && (
          <p style={{ color: "#dc2626", background: "#fef2f2", padding: 12, borderRadius: 8 }}>{error}</p>
        )}

        {!loading && info?.ok && (
          <>
            <div
              style={{
                background: "#fff",
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
              }}
            >
              <p style={{ margin: 0, fontSize: 13, color: "#888" }}>{t.frameLabel}</p>
              <p style={{ margin: "4px 0 0", fontWeight: 700, fontSize: 16 }}>
                {info.frameName || info.frameMac}
              </p>
            </div>

            <div
              style={{
                background: "#fff",
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
                textAlign: "center",
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrSrc} alt={t.qrAlt} width={200} height={200} style={{ display: "block", margin: "0 auto" }} />
              <p style={{ fontSize: 12, color: "#888", marginTop: 12, wordBreak: "break-all" }}>{info.inviteUrl}</p>
            </div>

            <label
              style={{
                display: "block",
                width: "100%",
                textAlign: "center",
                background: "#dc2626",
                color: "#fff",
                padding: "14px 20px",
                borderRadius: 10,
                fontWeight: 600,
                cursor: uploading ? "wait" : "pointer",
                opacity: uploading ? 0.7 : 1,
              }}
            >
              {uploading ? t.sending : t.choosePhoto}
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  void onPickPhoto(f);
                  e.target.value = "";
                }}
              />
            </label>

            {message && (
              <p style={{ color: "#15803d", marginTop: 16, textAlign: "center", fontSize: 14 }}>{message}</p>
            )}
            {error && (
              <p style={{ color: "#dc2626", marginTop: 16, textAlign: "center", fontSize: 14 }}>{error}</p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
