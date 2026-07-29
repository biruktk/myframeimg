import type { Locale } from "@/lib/i18n";

export type AppStrings = {
  nav: { home: string; send: string; playlist: string; family: string; settings: string };
  home: {
    sdTitle: string;
    sdSub: string;
    connected: string;
    livingRoom: string;
    /** Interpolate `{hours}` with the API value. */
    lastPhotoTemplate: string;
    awayMode: string;
    storage: string;
    photos: string;
    uptime: string;
    manage: string;
    quickActions: string;
    pair: string;
    send: string;
    playlist: string;
    share: string;
    importPhotos: string;
    statusLoadError: string;
  };
  send: {
    title: string;
    sd: string;
    sdSub: string;
    gallery: string;
    gallerySub: string;
    camera: string;
    cameraSub: string;
    shareLink: string;
    shareLinkSub: string;
    ai: string;
    aiSub: string;
    pro: string;
    gift: string;
    giftSub: string;
    chooseTransport: string;
    wifi: string;
    bluetooth: string;
    slideshow: string;
    fade: string;
    kenBurns: string;
    grid: string;
    random: string;
    sent: string;
    cancel: string;
    confirmSend: string;
    sending: string;
    sendToFrame: string;
    /** Gallery / camera: choose a file before sending */
    selectPhotoFirst: string;
    pickPhoto: string;
    uploadError: string;
    /** Use `{frameUrl}` and `{stored}` placeholders; omit lines if empty before replace. */
    uploadOkDetails: string;
    /** When API stores only MYFM `.bin` (same as MQTT URL path). */
    uploadPlaybackMyfm: string;
  };
  playlist: {
    title: string;
    createTitle: string;
    createSub: string;
    examples: string;
  };
  family: {
    title: string;
    body: string;
    invite: string;
    frames: string;
  };
  settings: {
    title: string;
    account: string;
    accountSub: string;
    device: string;
    deviceSub: string;
    notifications: string;
    notificationsSub: string;
    language: string;
    integrations: string;
    integrationsSub: string;
    preferences: string;
    preferencesSub: string;
    /** Express `server/` health for uploads & device status */
    apiBackend: string;
    apiOnline: string;
    apiOffline: string;
  };
};

const table: Record<Locale, AppStrings> = {
  en: {
    nav: {
      home: "Home",
      send: "Send",
      playlist: "Playlist",
      family: "Family",
      settings: "Settings",
    },
    home: {
      sdTitle: "SD Card Detected",
      sdSub: "Tap to import photos",
      connected: "Connected",
      livingRoom: "Living Room",
      lastPhotoTemplate: "Last photo: {hours} hours ago",
      awayMode: "Away",
      storage: "Storage",
      photos: "Photos",
      uptime: "Uptime",
      manage: "Manage device and pairing",
      quickActions: "Quick Actions",
      pair: "Pair",
      send: "Send",
      playlist: "Playlist",
      share: "Share",
      importPhotos: "Import Photos",
      statusLoadError: "Could not load device status. Showing defaults.",
    },
    send: {
      title: "Send Photo",
      sd: "SD Card",
      sdSub: "Import and save to card",
      gallery: "Photo Gallery",
      gallerySub: "Choose from your phone",
      camera: "Take Photo",
      cameraSub: "Capture a new photo",
      shareLink: "ShareLink",
      shareLinkSub: "Friends upload via link",
      ai: "AI Generate",
      aiSub: "Create unique art",
      pro: "PRO",
      gift: "Send Gift",
      giftSub: "Pick a card and send to family frame",
      chooseTransport: "Choose transport",
      wifi: "Wi‑Fi",
      bluetooth: "Bluetooth",
      slideshow: "Slideshow style",
      fade: "Fade",
      kenBurns: "Ken Burns",
      grid: "Grid",
      random: "Random",
      sent: "Sent to frame",
      cancel: "Cancel",
      confirmSend: "Send to frame",
      sending: "Sending…",
      sendToFrame: "Send to frame",
      selectPhotoFirst: "Choose a photo first.",
      pickPhoto: "Choose photo",
      uploadError: "Upload failed. Is the API running?",
      uploadOkDetails: "Saved on server as {stored}.\nFrame MQTT pull URL:\n{frameUrl}",
      uploadPlaybackMyfm: "Frame playback file (MYFM .bin):\n{url}",
    },
    playlist: {
      title: "Playlist",
      createTitle: "Create New Playlist",
      createSub: "Select images from gallery, then send to frame",
      examples: "Example playlists",
    },
    family: {
      title: "Family",
      body: "Invite members and manage shared frames.",
      invite: "Invite family",
      frames: "Shared frames",
    },
    settings: {
      title: "Settings",
      account: "Account",
      accountSub: "Profile, Birthday",
      device: "Device Info",
      deviceSub: "Manage paired devices, details, and pairing",
      notifications: "Notifications",
      notificationsSub: "Birthday alerts",
      language: "Language",
      integrations: "Integrations",
      integrationsSub: "Google Photos, iCloud",
      preferences: "App Preferences",
      preferencesSub: "Theme, updates, API key, SMS 2FA",
      apiBackend: "Frame API",
      apiOnline: "Backend reachable",
      apiOffline: "Backend offline — start the server (see README)",
    },
  },
  zh: {
    nav: { home: "首页", send: "发送", playlist: "播放列表", family: "家庭", settings: "设置" },
    home: {
      sdTitle: "检测到 SD 卡",
      sdSub: "点击导入照片",
      connected: "已连接",
      livingRoom: "客厅",
      lastPhotoTemplate: "上次照片：{hours} 小时前",
      awayMode: "外出",
      storage: "存储",
      photos: "照片",
      uptime: "运行",
      manage: "管理设备与配对",
      quickActions: "快捷操作",
      pair: "配对",
      send: "发送",
      playlist: "列表",
      share: "分享",
      importPhotos: "导入照片",
      statusLoadError: "无法加载设备状态，显示默认值。",
    },
    send: {
      title: "发送照片",
      sd: "SD 卡",
      sdSub: "导入并保存到卡",
      gallery: "相册",
      gallerySub: "从手机选择",
      camera: "拍照",
      cameraSub: "拍摄新照片",
      shareLink: "分享链接",
      shareLinkSub: "好友通过链接上传",
      ai: "AI 生成",
      aiSub: "生成独特作品",
      pro: "PRO",
      gift: "送礼",
      giftSub: "选择贺卡发送到家庭相框",
      chooseTransport: "选择传输方式",
      wifi: "Wi‑Fi",
      bluetooth: "蓝牙",
      slideshow: "幻灯片样式",
      fade: "淡入淡出",
      kenBurns: "推拉",
      grid: "网格",
      random: "随机",
      sent: "已发送到相框",
      cancel: "取消",
      confirmSend: "发送到相框",
      sending: "发送中…",
      sendToFrame: "发送到相框",
      selectPhotoFirst: "请先选择照片。",
      pickPhoto: "选择照片",
      uploadError: "上传失败，请确认 API 已启动。",
      uploadOkDetails: "服务器已保存：{stored}\n相框 MQTT 拉取 URL：\n{frameUrl}",
      uploadPlaybackMyfm: "相框播放文件（MYFM .bin）：\n{url}",
    },
    playlist: {
      title: "播放列表",
      createTitle: "新建播放列表",
      createSub: "从相册选择后发送到相框",
      examples: "示例列表",
    },
    family: {
      title: "家庭",
      body: "邀请成员并管理共享相框。",
      invite: "邀请家人",
      frames: "共享相框",
    },
    settings: {
      title: "设置",
      account: "账户",
      accountSub: "资料与生日",
      device: "设备信息",
      deviceSub: "配对与管理",
      notifications: "通知",
      notificationsSub: "生日提醒",
      language: "语言",
      integrations: "集成",
      integrationsSub: "Google 相册、iCloud",
      preferences: "应用偏好",
      preferencesSub: "主题、更新等",
      apiBackend: "相框 API",
      apiOnline: "后端已连通",
      apiOffline: "后端离线 — 请先启动 server（见 README）",
    },
  },
  es: {
    nav: {
      home: "Inicio",
      send: "Enviar",
      playlist: "Lista",
      family: "Familia",
      settings: "Ajustes",
    },
    home: {
      sdTitle: "Tarjeta SD",
      sdSub: "Toca para importar",
      connected: "Conectado",
      livingRoom: "Sala",
      lastPhotoTemplate: "Ultima foto: hace {hours} h",
      awayMode: "Ausente",
      storage: "Almacenamiento",
      photos: "Fotos",
      uptime: "Activo",
      manage: "Gestionar dispositivo",
      quickActions: "Acciones",
      pair: "Emparejar",
      send: "Enviar",
      playlist: "Lista",
      share: "Compartir",
      importPhotos: "Importar",
      statusLoadError: "No se pudo cargar el estado. Valores por defecto.",
    },
    send: {
      title: "Enviar foto",
      sd: "Tarjeta SD",
      sdSub: "Importar y guardar",
      gallery: "Galeria",
      gallerySub: "Desde el telefono",
      camera: "Tomar foto",
      cameraSub: "Nueva captura",
      shareLink: "Enlace",
      shareLinkSub: "Subida por enlace",
      ai: "IA",
      aiSub: "Arte unico",
      pro: "PRO",
      gift: "Regalo",
      giftSub: "Tarjeta al marco",
      chooseTransport: "Transporte",
      wifi: "Wi‑Fi",
      bluetooth: "Bluetooth",
      slideshow: "Estilo",
      fade: "Fundido",
      kenBurns: "Pan zoom",
      grid: "Cuadricula",
      random: "Aleatorio",
      sent: "Enviado al marco",
      cancel: "Cancelar",
      confirmSend: "Enviar al marco",
      sending: "Enviando…",
      sendToFrame: "Enviar al marco",
      selectPhotoFirst: "Elige una foto primero.",
      pickPhoto: "Elegir foto",
      uploadError: "Error de subida. ¿Esta la API en marcha?",
      uploadOkDetails: "Guardado en servidor: {stored}\nURL MQTT del marco:\n{frameUrl}",
      uploadPlaybackMyfm: "Archivo de reproducción (MYFM .bin):\n{url}",
    },
    playlist: {
      title: "Lista",
      createTitle: "Nueva lista",
      createSub: "Elige y envia al marco",
      examples: "Ejemplos",
    },
    family: {
      title: "Familia",
      body: "Invita y comparte marcos.",
      invite: "Invitar",
      frames: "Marcos compartidos",
    },
    settings: {
      title: "Ajustes",
      account: "Cuenta",
      accountSub: "Perfil",
      device: "Dispositivo",
      deviceSub: "Emparejar",
      notifications: "Notificaciones",
      notificationsSub: "Cumpleanos",
      language: "Idioma",
      integrations: "Integraciones",
      integrationsSub: "Google, iCloud",
      preferences: "Preferencias",
      preferencesSub: "Tema, 2FA",
      apiBackend: "API del marco",
      apiOnline: "Servidor disponible",
      apiOffline: "Sin servidor — inicia server/ (README)",
    },
  },
  fr: {
    nav: {
      home: "Accueil",
      send: "Envoyer",
      playlist: "Liste",
      family: "Famille",
      settings: "Reglages",
    },
    home: {
      sdTitle: "Carte SD",
      sdSub: "Importer des photos",
      connected: "Connecte",
      livingRoom: "Salon",
      lastPhotoTemplate: "Derniere photo: il y a {hours} h",
      awayMode: "Absent",
      storage: "Stockage",
      photos: "Photos",
      uptime: "Temps actif",
      manage: "Gerer appareil",
      quickActions: "Actions rapides",
      pair: "Appairer",
      send: "Envoyer",
      playlist: "Liste",
      share: "Partager",
      importPhotos: "Importer",
      statusLoadError: "Statut indisponible. Valeurs par defaut.",
    },
    send: {
      title: "Envoyer une photo",
      sd: "Carte SD",
      sdSub: "Importer sur la carte",
      gallery: "Galerie",
      gallerySub: "Depuis le telephone",
      camera: "Prendre une photo",
      cameraSub: "Nouvelle photo",
      shareLink: "Lien",
      shareLinkSub: "Upload par lien",
      ai: "IA",
      aiSub: "Art unique",
      pro: "PRO",
      gift: "Cadeau",
      giftSub: "Carte vers le cadre",
      chooseTransport: "Transport",
      wifi: "Wi‑Fi",
      bluetooth: "Bluetooth",
      slideshow: "Diaporama",
      fade: "Fondu",
      kenBurns: "Pan zoom",
      grid: "Grille",
      random: "Aleatoire",
      sent: "Envoye au cadre",
      cancel: "Annuler",
      confirmSend: "Envoyer au cadre",
      sending: "Envoi…",
      sendToFrame: "Envoyer au cadre",
      selectPhotoFirst: "Choisis dabord une photo.",
      pickPhoto: "Choisir une photo",
      uploadError: "Echec envoi. LAPI est-elle demarree ?",
      uploadOkDetails: "Enregistre sur le serveur : {stored}\nURL MQTT du cadre :\n{frameUrl}",
      uploadPlaybackMyfm: "Fichier de lecture (MYFM .bin) :\n{url}",
    },
    playlist: {
      title: "Liste",
      createTitle: "Nouvelle liste",
      createSub: "Choisis puis envoie",
      examples: "Exemples",
    },
    family: {
      title: "Famille",
      body: "Invitez et partagez les cadres.",
      invite: "Inviter",
      frames: "Cadres partages",
    },
    settings: {
      title: "Reglages",
      account: "Compte",
      accountSub: "Profil",
      device: "Appareil",
      deviceSub: "Appairage",
      notifications: "Notifications",
      notificationsSub: "Anniversaires",
      language: "Langue",
      integrations: "Integrations",
      integrationsSub: "Google, iCloud",
      preferences: "Preferences",
      preferencesSub: "Theme, 2FA",
      apiBackend: "API MyFrame",
      apiOnline: "Serveur disponible",
      apiOffline: "Hors ligne — lancez server/ (README)",
    },
  },
  de: {
    nav: {
      home: "Start",
      send: "Senden",
      playlist: "Wiedergabe",
      family: "Familie",
      settings: "Einstellungen",
    },
    home: {
      sdTitle: "SD-Karte erkannt",
      sdSub: "Tippen zum Importieren",
      connected: "Verbunden",
      livingRoom: "Wohnzimmer",
      lastPhotoTemplate: "Letztes Foto: vor {hours} Std.",
      awayMode: "Abwesend",
      storage: "Speicher",
      photos: "Fotos",
      uptime: "Laufzeit",
      manage: "Gerät & Kopplung",
      quickActions: "Schnellaktionen",
      pair: "Koppeln",
      send: "Senden",
      playlist: "Liste",
      share: "Teilen",
      importPhotos: "Fotos importieren",
      statusLoadError: "Gerätestatus nicht geladen — Standardwerte.",
    },
    send: {
      title: "Foto senden",
      sd: "SD-Karte",
      sdSub: "Importieren und auf Karte speichern",
      gallery: "Galerie",
      gallerySub: "Vom Telefon wählen",
      camera: "Foto aufnehmen",
      cameraSub: "Neues Foto",
      shareLink: "Link",
      shareLinkSub: "Upload per Link",
      ai: "KI",
      aiSub: "Einzigartige Kunst",
      pro: "PRO",
      gift: "Geschenk",
      giftSub: "Karte an den Rahmen",
      chooseTransport: "Übertragung",
      wifi: "Wi‑Fi",
      bluetooth: "Bluetooth",
      slideshow: "Diashow",
      fade: "Überblendung",
      kenBurns: "Ken Burns",
      grid: "Raster",
      random: "Zufall",
      sent: "An Rahmen gesendet",
      cancel: "Abbrechen",
      confirmSend: "An Rahmen senden",
      sending: "Wird gesendet…",
      sendToFrame: "An Rahmen senden",
      selectPhotoFirst: "Bitte zuerst ein Foto wählen.",
      pickPhoto: "Foto wählen",
      uploadError: "Upload fehlgeschlagen. Läuft die API?",
      uploadOkDetails: "Auf dem Server: {stored}\nMQTT-URL für den Rahmen:\n{frameUrl}",
      uploadPlaybackMyfm: "Abspieldatei (MYFM .bin):\n{url}",
    },
    playlist: {
      title: "Wiedergabe",
      createTitle: "Neue Playlist",
      createSub: "Aus Galerie wählen und an den Rahmen senden",
      examples: "Beispiele",
    },
    family: {
      title: "Familie",
      body: "Mitglieder einladen und Rahmen teilen.",
      invite: "Familie einladen",
      frames: "Geteilte Rahmen",
    },
    settings: {
      title: "Einstellungen",
      account: "Konto",
      accountSub: "Profil",
      device: "Gerät",
      deviceSub: "Kopplung",
      notifications: "Benachrichtigungen",
      notificationsSub: "Geburtstage",
      language: "Sprache",
      integrations: "Integrationen",
      integrationsSub: "Google Fotos, iCloud",
      preferences: "App-Einstellungen",
      preferencesSub: "Theme, Updates, 2FA",
      apiBackend: "Frame-API",
      apiOnline: "Server erreichbar",
      apiOffline: "Server offline — server/ starten (README)",
    },
  },
  ja: {
    nav: {
      home: "ホーム",
      send: "送信",
      playlist: "プレイリスト",
      family: "家族",
      settings: "設定",
    },
    home: {
      sdTitle: "SDカードを検出",
      sdSub: "タップして写真を読み込む",
      connected: "接続済み",
      livingRoom: "リビング",
      lastPhotoTemplate: "最後の写真: {hours}時間前",
      awayMode: "留守",
      storage: "ストレージ",
      photos: "写真",
      uptime: "稼働",
      manage: "デバイスとペア設定",
      quickActions: "クイック操作",
      pair: "ペア",
      send: "送信",
      playlist: "リスト",
      share: "共有",
      importPhotos: "写真を読み込む",
      statusLoadError: "状態を読み込めませんでした。既定値を表示します。",
    },
    send: {
      title: "写真を送る",
      sd: "SDカード",
      sdSub: "カードへ保存",
      gallery: "フォトライブラリ",
      gallerySub: "端末から選択",
      camera: "撮影",
      cameraSub: "新規撮影",
      shareLink: "共有リンク",
      shareLinkSub: "リンクでアップロード",
      ai: "AI生成",
      aiSub: "ユニークな作品",
      pro: "PRO",
      gift: "ギフト",
      giftSub: "カードをフレームへ",
      chooseTransport: "転送方法",
      wifi: "Wi‑Fi",
      bluetooth: "Bluetooth",
      slideshow: "スライドショー",
      fade: "フェード",
      kenBurns: "ケン・バーンズ",
      grid: "グリッド",
      random: "ランダム",
      sent: "フレームへ送信しました",
      cancel: "キャンセル",
      confirmSend: "フレームへ送信",
      sending: "送信中…",
      sendToFrame: "フレームへ送信",
      selectPhotoFirst: "先に写真を選んでください。",
      pickPhoto: "写真を選ぶ",
      uploadError: "アップロードに失敗しました。APIは起動していますか？",
      uploadOkDetails: "サーバー保存: {stored}\nフレーム MQTT URL:\n{frameUrl}",
      uploadPlaybackMyfm: "再生ファイル（MYFM .bin）:\n{url}",
    },
    playlist: {
      title: "プレイリスト",
      createTitle: "新規プレイリスト",
      createSub: "ギャラリーから選びフレームへ送信",
      examples: "サンプル",
    },
    family: {
      title: "家族",
      body: "メンバーを招待し共有フレームを管理。",
      invite: "家族を招待",
      frames: "共有フレーム",
    },
    settings: {
      title: "設定",
      account: "アカウント",
      accountSub: "プロフィール",
      device: "デバイス",
      deviceSub: "ペア設定",
      notifications: "通知",
      notificationsSub: "誕生日",
      language: "言語",
      integrations: "連携",
      integrationsSub: "Googleフォト、iCloud",
      preferences: "アプリ設定",
      preferencesSub: "テーマ、更新、2FA",
      apiBackend: "フレーム API",
      apiOnline: "バックエンド接続済み",
      apiOffline: "バックエンド未接続 — server/ を起動（README）",
    },
  },
};

export function getAppStrings(locale: Locale): AppStrings {
  return table[locale] ?? table.en;
}
