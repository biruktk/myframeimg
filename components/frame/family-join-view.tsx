"use client";

import { useEffect } from "react";

import type { Locale } from "@/lib/i18n";

type Props = {
  locale: Locale;
  code: string;
};

const copy: Record<
  Locale,
  {
    title: string;
    lead: string;
    openApp: string;
    download: string;
    codeLabel: string;
    steps: string[];
    invalid: string;
  }
> = {
  en: {
    title: "Join a MyFrame family",
    lead: "Someone invited you to share photos with their family group.",
    openApp: "Open in MyFrame app",
    download: "Get the app",
    codeLabel: "Invite code",
    steps: [
      "Install MyFrame if you do not have it yet.",
      "Open the app and sign in.",
      "Go to Family → Join family and enter the code below.",
    ],
    invalid: "This invite link is missing a valid 8-character code.",
  },
  zh: {
    title: "加入 MyFrame 家庭",
    lead: "有人邀请你加入他们的家庭组并共享照片。",
    openApp: "在 MyFrame 应用中打开",
    download: "下载应用",
    codeLabel: "邀请码",
    steps: ["如未安装请先下载 MyFrame。", "打开应用并登录。", "进入「家庭」→「加入家庭」并输入下方邀请码。"],
    invalid: "此邀请链接缺少有效的 8 位邀请码。",
  },
  es: {
    title: "Únete a una familia MyFrame",
    lead: "Te invitaron a compartir fotos con su grupo familiar.",
    openApp: "Abrir en la app MyFrame",
    download: "Descargar la app",
    codeLabel: "Código de invitación",
    steps: [
      "Instala MyFrame si aún no la tienes.",
      "Abre la app e inicia sesión.",
      "Ve a Familia → Unirse e introduce el código.",
    ],
    invalid: "Este enlace no incluye un código válido de 8 caracteres.",
  },
  fr: {
    title: "Rejoindre une famille MyFrame",
    lead: "Quelqu'un vous a invité à partager des photos avec son groupe familial.",
    openApp: "Ouvrir dans l'app MyFrame",
    download: "Télécharger l'app",
    codeLabel: "Code d'invitation",
    steps: [
      "Installez MyFrame si nécessaire.",
      "Ouvrez l'app et connectez-vous.",
      "Allez dans Famille → Rejoindre et saisissez le code.",
    ],
    invalid: "Ce lien ne contient pas de code valide à 8 caractères.",
  },
  de: {
    title: "MyFrame-Familie beitreten",
    lead: "Jemand hat dich eingeladen, Fotos in seiner Familiengruppe zu teilen.",
    openApp: "In der MyFrame-App öffnen",
    download: "App herunterladen",
    codeLabel: "Einladungscode",
    steps: [
      "Installiere MyFrame, falls noch nicht geschehen.",
      "Öffne die App und melde dich an.",
      "Gehe zu Familie → Beitreten und gib den Code ein.",
    ],
    invalid: "Dieser Link enthält keinen gültigen 8-stelligen Code.",
  },
  ja: {
    title: "MyFrameの家族に参加",
    lead: "家族グループで写真を共有するよう招待されました。",
    openApp: "MyFrameアプリで開く",
    download: "アプリを入手",
    codeLabel: "招待コード",
    steps: [
      "未インストールの場合は MyFrame をインストールしてください。",
      "アプリを開いてサインインします。",
      "「家族」→「家族に参加」で下のコードを入力します。",
    ],
    invalid: "有効な8文字の招待コードがありません。",
  },
};

export function FamilyJoinView({ locale, code }: Props) {
  const t = copy[locale] ?? copy.en;
  const valid = code.length === 8;

  useEffect(() => {
    if (!valid || typeof window === "undefined") return;
    const deep = `myframe://join?code=${encodeURIComponent(code)}`;
    const timer = window.setTimeout(() => {
      window.location.href = deep;
    }, 400);
    return () => window.clearTimeout(timer);
  }, [code, valid]);

  const appDeepLink = valid ? `myframe://join?code=${encodeURIComponent(code)}` : "#";
  const downloadHref = `/${locale}/download`;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f5f5f5",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        padding: "32px 16px",
      }}
    >
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 8px", color: "#111" }}>{t.title}</h1>
        <p style={{ margin: "0 0 20px", color: "#666", fontSize: 15, lineHeight: 1.5 }}>{t.lead}</p>

        {!valid && (
          <p style={{ color: "#dc2626", background: "#fef2f2", padding: 12, borderRadius: 8 }}>{t.invalid}</p>
        )}

        {valid && (
          <>
            <div
              style={{
                background: "#fff",
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                textAlign: "center",
              }}
            >
              <p style={{ margin: 0, fontSize: 13, color: "#888" }}>{t.codeLabel}</p>
              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: 28,
                  fontWeight: 800,
                  letterSpacing: 4,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                }}
              >
                {code}
              </p>
            </div>

            <a
              href={appDeepLink}
              style={{
                display: "block",
                textAlign: "center",
                background: "#dc2626",
                color: "#fff",
                padding: "14px 20px",
                borderRadius: 10,
                fontWeight: 600,
                textDecoration: "none",
                marginBottom: 12,
              }}
            >
              {t.openApp}
            </a>

            <a
              href={downloadHref}
              style={{
                display: "block",
                textAlign: "center",
                background: "#fff",
                color: "#111",
                padding: "12px 20px",
                borderRadius: 10,
                fontWeight: 600,
                textDecoration: "none",
                border: "1px solid #ddd",
                marginBottom: 20,
              }}
            >
              {t.download}
            </a>
          </>
        )}

        <ol style={{ margin: 0, paddingLeft: 20, color: "#444", fontSize: 14, lineHeight: 1.6 }}>
          {t.steps.map((step) => (
            <li key={step} style={{ marginBottom: 8 }}>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
