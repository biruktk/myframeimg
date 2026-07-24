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
      "Go to Family \u2192 Join family and enter the code below.",
    ],
    invalid: "This invite link is missing a valid 8-character code.",
  },
  zh: {
    title: "\u52A0\u5165 MyFrame \u5BB6\u5EAD",
    lead: "\u6709\u4EBA\u9080\u8BF7\u4F60\u52A0\u5165\u4ED6\u4EEC\u7684\u5BB6\u5EAD\u7EC4\u5E76\u5171\u4EAB\u7167\u7247\u3002",
    openApp: "\u5728 MyFrame \u5E94\u7528\u4E2D\u6253\u5F00",
    download: "\u4E0B\u8F7D\u5E94\u7528",
    codeLabel: "\u9080\u8BF7\u7801",
    steps: ["\u5982\u672A\u5B89\u88C5\u8BF7\u5148\u4E0B\u8F7D MyFrame\u3002", "\u6253\u5F00\u5E94\u7528\u5E76\u767B\u5F55\u3002", "\u8FDB\u5165\u300C\u5BB6\u5EAD\u300D\u2192\u300C\u52A0\u5165\u5BB6\u5EAD\u300D\u5E76\u8F93\u5165\u4E0B\u65B9\u9080\u8BF7\u7801\u3002"],
    invalid: "\u6B64\u9080\u8BF7\u94FE\u63A5\u7F3A\u5C11\u6709\u6548\u7684 8 \u4F4D\u9080\u8BF7\u7801\u3002",
  },
  es: {
    title: "\u00DAnete a una familia MyFrame",
    lead: "Te invitaron a compartir fotos con su grupo familiar.",
    openApp: "Abrir en la app MyFrame",
    download: "Descargar la app",
    codeLabel: "C\u00F3digo de invitaci\u00F3n",
    steps: [
      "Instala MyFrame si a\u00FAn no la tienes.",
      "Abre la app e inicia sesi\u00F3n.",
      "Ve a Familia \u2192 Unirse e introduce el c\u00F3digo.",
    ],
    invalid: "Este enlace no incluye un c\u00F3digo v\u00E1lido de 8 caracteres.",
  },
  fr: {
    title: "Rejoindre une famille MyFrame",
    lead: "Quelqu'un vous a invit\u00E9 \u00E0 partager des photos avec son groupe familial.",
    openApp: "Ouvrir dans l'app MyFrame",
    download: "T\u00E9l\u00E9charger l'app",
    codeLabel: "Code d'invitation",
    steps: [
      "Installez MyFrame si n\u00E9cessaire.",
      "Ouvrez l'app et connectez-vous.",
      "Allez dans Famille \u2192 Rejoindre et saisissez le code.",
    ],
    invalid: "Ce lien ne contient pas de code valide \u00E0 8 caract\u00E8res.",
  },
  de: {
    title: "MyFrame-Familie beitreten",
    lead: "Jemand hat dich eingeladen, Fotos in seiner Familiengruppe zu teilen.",
    openApp: "In der MyFrame-App \u00F6ffnen",
    download: "App herunterladen",
    codeLabel: "Einladungscode",
    steps: [
      "Installiere MyFrame, falls noch nicht geschehen.",
      "\u00D6ffne die App und melde dich an.",
      "Gehe zu Familie \u2192 Beitreten und gib den Code ein.",
    ],
    invalid: "Dieser Link enth\u00E4lt keinen g\u00FCltigen 8-stelligen Code.",
  },
  ja: {
    title: "MyFrame\u306E\u5BB6\u65CF\u306B\u53C2\u52A0",
    lead: "\u5BB6\u65CF\u30B0\u30EB\u30FC\u30D7\u3067\u5199\u771F\u3092\u5171\u6709\u3059\u308B\u3088\u3046\u62DB\u5F85\u3055\u308C\u307E\u3057\u305F\u3002",
    openApp: "MyFrame\u30A2\u30D7\u30EA\u3067\u958B\u304F",
    download: "\u30A2\u30D7\u30EA\u3092\u5165\u624B",
    codeLabel: "\u62DB\u5F85\u30B3\u30FC\u30C9",
    steps: [
      "\u672A\u30A4\u30F3\u30B9\u30C8\u30FC\u30EB\u306E\u5834\u5408\u306F MyFrame \u3092\u30A4\u30F3\u30B9\u30C8\u30FC\u30EB\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "\u30A2\u30D7\u30EA\u3092\u958B\u3044\u3066\u30B5\u30A4\u30F3\u30A4\u30F3\u3057\u307E\u3059\u3002",
      "\u300C\u5BB6\u65CF\u300D\u2192\u300C\u5BB6\u65CF\u306B\u53C2\u52A0\u300D\u3067\u4E0B\u306E\u30B3\u30FC\u30C9\u3092\u5165\u529B\u3057\u307E\u3059\u3002",
    ],
    invalid: "\u6709\u52B9\u306A8\u6587\u5B57\u306E\u62DB\u5F85\u30B3\u30FC\u30C9\u304C\u3042\u308A\u307E\u305B\u3093\u3002",
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
