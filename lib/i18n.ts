export const locales = ["en", "zh", "es", "fr", "de", "ja"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

type Dictionary = {
  appName: string;
  tagline: string;
  subtitle: string;
  ctaPrimary: string;
  ctaSecondary: string;
  languageLabel: string;
  quickStartTitle: string;
  quickSteps: string[];
  /** Hero copy aligned with `ra/ui/website-official.html` */
  heroEyebrow: string;
  heroTitle: string;
  heroLead: string;
  /** Top nav CTA → in-app shell */
  navOpenApp: string;
  /** Small footer note pointing designers to `ra/ui` */
  raReferenceNote: string;
};

const dictionaries: Record<Locale, Dictionary> = {
  en: {
    appName: "MyFrame",
    tagline: "Smart photo frame with AI art, family sharing, and live sync.",
    subtitle: "Everything important in 3 simple steps.",
    ctaPrimary: "Pair a Device",
    ctaSecondary: "Create AI Artwork",
    languageLabel: "Language",
    quickStartTitle: "Quick Start",
    quickSteps: ["Sign in", "Pair your frame", "Send first photo"],
    heroEyebrow: "True color ePaper frame",
    heroTitle: "Photos that feel printed, not streamed.",
    heroLead:
      "MyFrame brings family photos, art, and daily moments into the room with a quiet matte display made for the home.",
    navOpenApp: "Open app",
    raReferenceNote:
      "Colors and structure follow the references in ra/ui (website-official, portal-dashboard, mobile-app-dualmode).",
  },
  zh: {
    appName: "MyFrame",
    tagline: "智能电子相框，支持 AI 绘图、家庭共享和实时同步。",
    subtitle: "3 个步骤快速开始。",
    ctaPrimary: "连接设备",
    ctaSecondary: "创建 AI 图片",
    languageLabel: "语言",
    quickStartTitle: "快速开始",
    quickSteps: ["登录", "连接相框", "发送第一张照片"],
    heroEyebrow: "真彩电子纸相框",
    heroTitle: "像冲印出来的一样，而不是流媒体。",
    heroLead:
      "MyFrame 将家庭照片、艺术和日常瞬间带入房间，采用适合家居的哑光显示。",
    navOpenApp: "打开应用",
    raReferenceNote: "色板与版式对齐仓库内 ra/ui 官网与门户参考稿。",
  },
  es: {
    appName: "MyFrame",
    tagline:
      "Marco de fotos inteligente con arte AI, uso familiar y sincronizacion en vivo.",
    subtitle: "Todo lo importante en 3 pasos simples.",
    ctaPrimary: "Vincular dispositivo",
    ctaSecondary: "Crear arte AI",
    languageLabel: "Idioma",
    quickStartTitle: "Inicio rapido",
    quickSteps: ["Iniciar sesion", "Vincular marco", "Enviar primera foto"],
    heroEyebrow: "Marco ePaper a color real",
    heroTitle: "Fotos que parecen impresas, no en streaming.",
    heroLead:
      "MyFrame lleva fotos familiares, arte y momentos cotidianos a la habitacion con una pantalla mate pensada para el hogar.",
    navOpenApp: "Abrir app",
    raReferenceNote:
      "La UI sigue los tokens de ra/ui (sitio oficial, portal, app movil).",
  },
  fr: {
    appName: "MyFrame",
    tagline:
      "Cadre photo intelligent avec art IA, partage familial et sync en direct.",
    subtitle: "Tout l essentiel en 3 etapes simples.",
    ctaPrimary: "Associer un appareil",
    ctaSecondary: "Creer une image IA",
    languageLabel: "Langue",
    quickStartTitle: "Demarrage rapide",
    quickSteps: ["Se connecter", "Associer le cadre", "Envoyer la premiere photo"],
    heroEyebrow: "Cadre ePaper couleur reel",
    heroTitle: "Des photos qui semblent imprimees, pas diffusees.",
    heroLead:
      "MyFrame met photos de famille, art et instants du quotidien dans la piece avec un affichage mat adapte a la maison.",
    navOpenApp: "Ouvrir l app",
    raReferenceNote:
      "Couleurs et structure d apres ra/ui (site, portail, mobile).",
  },
  de: {
    appName: "MyFrame",
    tagline:
      "Intelligenter Bilderrahmen mit KI-Kunst, Familienfreigabe und Live-Sync.",
    subtitle: "Das Wichtigste in drei einfachen Schritten.",
    ctaPrimary: "Gerät koppeln",
    ctaSecondary: "KI-Bild erstellen",
    languageLabel: "Sprache",
    quickStartTitle: "Schnellstart",
    quickSteps: ["Anmelden", "Rahmen koppeln", "Erstes Foto senden"],
    heroEyebrow: "Echter Farb-ePaper-Rahmen",
    heroTitle: "Fotos wie gedruckt — nicht wie Stream.",
    heroLead:
      "MyFrame holt Familienfotos, Kunst und Alltagsmomente in den Raum — mit ruhigem Mattdisplay fur Zuhause.",
    navOpenApp: "App öffnen",
    raReferenceNote:
      "Design-Tokens aus ra/ui (Website, Portal, Mobile-Mockups).",
  },
  ja: {
    appName: "MyFrame",
    tagline:
      "AIアート、家族共有、ライブ同期に対応したスマートフォトフレーム。",
    subtitle: "大切なことを3つのステップで。",
    ctaPrimary: "デバイスとペア",
    ctaSecondary: "AIアートを作る",
    languageLabel: "言語",
    quickStartTitle: "クイックスタート",
    quickSteps: ["サインイン", "フレームをペア", "最初の写真を送信"],
    heroEyebrow: "真色の電子ペーパーフレーム",
    heroTitle: "ストリームではなく、プリントのような写真を。",
    heroLead:
      "MyFrame は家族の写真、アート、日常のひとときを、家向けの落ち着いたマット表示で部屋に届けます。",
    navOpenApp: "アプリを開く",
    raReferenceNote:
      "配色・構成はリポジトリ内 ra/ui（公式サイト・ポータル・モバイル稿）に準拠。",
  },
};

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries[defaultLocale];
}

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}
