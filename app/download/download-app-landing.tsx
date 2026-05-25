import Image from "next/image";

import { MarketingContentNav } from "@/components/marketing/marketing-content-nav";
import { defaultLocale, type Locale } from "@/lib/i18n";
import type { MarketingMenuItem } from "@/lib/marketing-public-site-server";

type LangRow = { code: string; name?: string; native_name?: string };

type Props = {
  locale?: Locale;
  menus?: MarketingMenuItem[];
  translated?: Record<string, string>;
  logoSrc?: string;
  languages?: LangRow[];
  downloadLinks?: Partial<Record<"ios" | "android" | "miniApp" | "apk", string>>;
};

type DownloadCopy = {
  kicker: string;
  titleLine1: string;
  titleLine2: string;
  lead: string;
  featuresKicker: string;
  featuresTitle: string;
  featuresLead: string;
  ctaKicker: string;
  ctaTitle: string;
  ctaLead: string;
  badgeLabel: string;
  features: Array<[string, string, string]>;
};

const appStoreSearchUrl = "https://apps.apple.com/us/search?term=MyFrame";
const playStoreSearchUrl = "https://play.google.com/store/search?q=MyFrame&c=apps";

const heroScreens = [
  { src: "/assets/myframe-app-home.jpg", alt: "MyFrame home app screen" },
  { src: "/assets/myframe-app-send.jpg", alt: "MyFrame send photo app screen" },
  { src: "/assets/myframe-app-playlist.jpg", alt: "MyFrame playlist app screen" },
];

const downloadCopy: Record<Locale, DownloadCopy> = {
  en: {
    kicker: "MyFrame mobile app",
    titleLine1: "Send family moments",
    titleLine2: "straight to your frame.",
    lead:
      "Download MyFrame to pair your device, send photos, manage playlists, invite family, and create AI artwork from one simple app.",
    featuresKicker: "Everything in one place",
    featuresTitle: "Simple tools for sharing photos with the people you love.",
    featuresLead:
      "MyFrame keeps setup and daily sharing calm: clear pairing, quick send actions, playlists, family invites, and frame settings that are easy to scan.",
    ctaKicker: "Download app",
    ctaTitle: "Start with the app, then bring the photos home.",
    ctaLead:
      "Open this page on your phone or search for MyFrame in the App Store or Google Play. Use the app to pair your frame and send the first photo.",
    badgeLabel: "Download MyFrame app",
    features: [
      ["fas fa-wifi", "Fast pairing", "Connect the frame to Wi-Fi and see setup progress in one place."],
      ["fas fa-paper-plane", "Send photos", "Pick a photo, fine-tune it, then send it to your frame."],
      ["fas fa-list", "Build playlists", "Group memories into albums for family, kids, trips, and AI creations."],
      ["fas fa-users", "Invite family", "Share an invite code so loved ones can add photos from anywhere."],
    ],
  },
  zh: {
    kicker: "MyFrame 手机应用",
    titleLine1: "把家庭瞬间",
    titleLine2: "直接送到相框。",
    lead:
      "下载 MyFrame，即可配对设备、发送照片、管理播放列表、邀请家人，并在一个简单应用中创建 AI 艺术作品。",
    featuresKicker: "全部集中在一处",
    featuresTitle: "用简单工具和你爱的人分享照片。",
    featuresLead:
      "MyFrame 让设置和日常分享更轻松：清晰配对、快速发送、播放列表、家庭邀请，以及一目了然的相框设置。",
    ctaKicker: "下载应用",
    ctaTitle: "先打开应用，再把照片带回家。",
    ctaLead:
      "在手机上打开此页面，或在 App Store 和 Google Play 搜索 MyFrame。使用应用配对相框并发送第一张照片。",
    badgeLabel: "下载 MyFrame 应用",
    features: [
      ["fas fa-wifi", "快速配对", "连接相框到 Wi-Fi，并在一个位置查看设置进度。"],
      ["fas fa-paper-plane", "发送照片", "选择照片，简单调整后发送到你的相框。"],
      ["fas fa-list", "创建播放列表", "把家庭、孩子、旅行和 AI 创作整理成相册。"],
      ["fas fa-users", "邀请家人", "分享邀请码，让亲友可以随时添加照片。"],
    ],
  },
  es: {
    kicker: "App movil MyFrame",
    titleLine1: "Envia momentos familiares",
    titleLine2: "directo a tu marco.",
    lead:
      "Descarga MyFrame para vincular tu dispositivo, enviar fotos, administrar playlists, invitar a la familia y crear arte con AI.",
    featuresKicker: "Todo en un lugar",
    featuresTitle: "Herramientas simples para compartir fotos con quienes amas.",
    featuresLead:
      "MyFrame hace que la configuracion y el uso diario sean tranquilos: vinculacion clara, envio rapido, playlists, invitaciones y ajustes faciles de leer.",
    ctaKicker: "Descargar app",
    ctaTitle: "Empieza con la app y lleva las fotos a casa.",
    ctaLead:
      "Abre esta pagina en tu telefono o busca MyFrame en App Store o Google Play. Usa la app para vincular tu marco y enviar la primera foto.",
    badgeLabel: "Descargar app MyFrame",
    features: [
      ["fas fa-wifi", "Vinculacion rapida", "Conecta el marco a Wi-Fi y mira el progreso en un solo lugar."],
      ["fas fa-paper-plane", "Enviar fotos", "Elige una foto, ajustala y enviala a tu marco."],
      ["fas fa-list", "Crear playlists", "Agrupa recuerdos para familia, ninos, viajes y creaciones AI."],
      ["fas fa-users", "Invitar familia", "Comparte un codigo para que tus seres queridos agreguen fotos."],
    ],
  },
  fr: {
    kicker: "App mobile MyFrame",
    titleLine1: "Envoyez les moments familiaux",
    titleLine2: "directement au cadre.",
    lead:
      "Telechargez MyFrame pour associer votre appareil, envoyer des photos, gerer les playlists, inviter la famille et creer de l art IA.",
    featuresKicker: "Tout au meme endroit",
    featuresTitle: "Des outils simples pour partager les photos avec vos proches.",
    featuresLead:
      "MyFrame rend la configuration et le partage quotidien plus calmes: association claire, envoi rapide, playlists, invitations et reglages faciles a lire.",
    ctaKicker: "Telecharger l app",
    ctaTitle: "Commencez avec l app, puis ramenez les photos a la maison.",
    ctaLead:
      "Ouvrez cette page sur votre telephone ou cherchez MyFrame dans l App Store ou Google Play. Utilisez l app pour associer le cadre et envoyer la premiere photo.",
    badgeLabel: "Telecharger l app MyFrame",
    features: [
      ["fas fa-wifi", "Association rapide", "Connectez le cadre au Wi-Fi et suivez la progression au meme endroit."],
      ["fas fa-paper-plane", "Envoyer des photos", "Choisissez une photo, ajustez-la, puis envoyez-la au cadre."],
      ["fas fa-list", "Creer des playlists", "Regroupez les souvenirs de famille, enfants, voyages et creations IA."],
      ["fas fa-users", "Inviter la famille", "Partagez un code pour que vos proches ajoutent des photos."],
    ],
  },
  de: {
    kicker: "MyFrame Mobile App",
    titleLine1: "Familienmomente senden",
    titleLine2: "direkt an den Rahmen.",
    lead:
      "Lade MyFrame herunter, um dein Geraet zu koppeln, Fotos zu senden, Playlists zu verwalten, Familie einzuladen und AI-Kunst zu erstellen.",
    featuresKicker: "Alles an einem Ort",
    featuresTitle: "Einfache Werkzeuge zum Teilen von Fotos mit deinen Liebsten.",
    featuresLead:
      "MyFrame macht Einrichtung und Alltag ruhig: klare Kopplung, schnelles Senden, Playlists, Familieneinladungen und gut lesbare Einstellungen.",
    ctaKicker: "App herunterladen",
    ctaTitle: "Starte mit der App und bringe die Fotos nach Hause.",
    ctaLead:
      "Oeffne diese Seite auf deinem Telefon oder suche MyFrame im App Store oder bei Google Play. Nutze die App, um den Rahmen zu koppeln und das erste Foto zu senden.",
    badgeLabel: "MyFrame App herunterladen",
    features: [
      ["fas fa-wifi", "Schnell koppeln", "Verbinde den Rahmen mit Wi-Fi und sieh den Fortschritt an einem Ort."],
      ["fas fa-paper-plane", "Fotos senden", "Waehle ein Foto, passe es an und sende es an deinen Rahmen."],
      ["fas fa-list", "Playlists bauen", "Sammle Erinnerungen fuer Familie, Kinder, Reisen und AI-Kreationen."],
      ["fas fa-users", "Familie einladen", "Teile einen Code, damit deine Liebsten Fotos hinzufuegen koennen."],
    ],
  },
  ja: {
    kicker: "MyFrame モバイルアプリ",
    titleLine1: "家族の瞬間を",
    titleLine2: "フレームへ直接送信。",
    lead:
      "MyFrame をダウンロードして、デバイスのペアリング、写真送信、プレイリスト管理、家族招待、AI アート作成をひとつのアプリで行えます。",
    featuresKicker: "すべてをひとつに",
    featuresTitle: "大切な人と写真を共有するためのシンプルなツール。",
    featuresLead:
      "MyFrame は、わかりやすいペアリング、すばやい送信、プレイリスト、家族招待、見やすい設定で毎日の共有をスムーズにします。",
    ctaKicker: "アプリをダウンロード",
    ctaTitle: "アプリから始めて、写真を家に届けましょう。",
    ctaLead:
      "スマートフォンでこのページを開くか、App Store または Google Play で MyFrame を検索してください。アプリでフレームをペアリングし、最初の写真を送信できます。",
    badgeLabel: "MyFrame アプリをダウンロード",
    features: [
      ["fas fa-wifi", "かんたんペアリング", "フレームを Wi-Fi に接続し、設定状況をひと目で確認できます。"],
      ["fas fa-paper-plane", "写真を送信", "写真を選び、調整してからフレームへ送信できます。"],
      ["fas fa-list", "プレイリスト作成", "家族、子ども、旅行、AI 作品の思い出をアルバムに整理できます。"],
      ["fas fa-users", "家族を招待", "招待コードを共有して、離れた場所からでも写真を追加できます。"],
    ],
  },
};

function DownloadOptions({
  links,
  label,
}: {
  links: Partial<Record<"ios" | "android" | "miniApp" | "apk", string>>;
  label: string;
}) {
  const items = [
    { key: "ios", icon: "fab fa-apple", title: "iOS", body: "App Store", href: links.ios || appStoreSearchUrl },
    { key: "android", icon: "fab fa-google-play", title: "Android", body: "Google Play", href: links.android || playStoreSearchUrl },
    { key: "miniApp", icon: "fas fa-qrcode", title: "Mini App", body: "WeChat / mini app", href: links.miniApp || "#" },
    { key: "apk", icon: "fas fa-download", title: "APK", body: "Direct install file", href: links.apk || "#" },
  ];
  return (
    <div className="download-options" aria-label={label}>
      {items.map((item) => (
        <a className="download-option" href={item.href} key={item.key}>
          <i className={item.icon} aria-hidden="true" />
          <span>
            <strong>{item.title}</strong>
            <small>{item.body}</small>
          </span>
        </a>
      ))}
    </div>
  );
}

function PhoneShot({
  src,
  alt,
  priority,
  className = "",
}: {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div className={`phone-shot ${className}`}>
      <Image src={src} alt={alt} width={590} height={1280} priority={priority} />
    </div>
  );
}

export function DownloadAppLanding({
  locale = defaultLocale,
  menus = [],
  translated = {},
  logoSrc = "/assets/myframe-logo-final.svg",
  languages = [],
  downloadLinks = {},
}: Props) {
  const copy = downloadCopy[locale] ?? downloadCopy.en;

  return (
    <div className="download-page">
      <MarketingContentNav
        locale={locale}
        menus={menus}
        translated={translated}
        logoSrc={logoSrc}
        languages={languages}
      />

      <main>
        <section className="download-section download-hero">
          <div className="download-copy centered">
            <span className="download-kicker">{copy.kicker}</span>
            <h1>
              {copy.titleLine1}
              <span>{copy.titleLine2}</span>
            </h1>
            <p>{copy.lead}</p>
            <DownloadOptions links={downloadLinks} label={copy.badgeLabel} />
          </div>

          <div className="hero-phone-row" aria-label="MyFrame app screens">
            {heroScreens.map((screen, index) => (
              <PhoneShot
                key={screen.src}
                src={screen.src}
                alt={screen.alt}
                priority={index === 1}
                className={index === 1 ? "is-front" : ""}
              />
            ))}
          </div>
        </section>

        <section className="download-section download-features">
          <div className="feature-phone-wrap">
            <PhoneShot src="/assets/myframe-app-family.jpg" alt="MyFrame family sharing app screen" />
          </div>

          <div className="download-copy">
            <span className="download-kicker">{copy.featuresKicker}</span>
            <h2>{copy.featuresTitle}</h2>
            <p>{copy.featuresLead}</p>

            <div className="feature-grid">
              {copy.features.map(([icon, title, body]) => (
                <article className="feature-item" key={title}>
                  <i className={icon} aria-hidden="true" />
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="download-section download-cta">
          <div className="download-copy">
            <span className="download-kicker">{copy.ctaKicker}</span>
            <h2>{copy.ctaTitle}</h2>
            <p>{copy.ctaLead}</p>
            <DownloadOptions links={downloadLinks} label={copy.badgeLabel} />
          </div>

          <div className="cta-phone-wrap">
            <PhoneShot src="/assets/myframe-app-settings.jpg" alt="MyFrame settings app screen" />
          </div>
        </section>
      </main>
    </div>
  );
}
