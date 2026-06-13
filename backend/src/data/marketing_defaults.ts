/**
 * Seed values for persisted `marketingSite` in JSON DB merged by GET /api/public/site.
 */

const languages = [
  { code: "en", name: "English", native_name: "English", language_order: 1 },
  { code: "zh", name: "Chinese", native_name: "中文", language_order: 2 },
  { code: "es", name: "Spanish", native_name: "Español", language_order: 3 },
  { code: "fr", name: "French", native_name: "Français", language_order: 4 },
  { code: "de", name: "German", native_name: "Deutsch", language_order: 5 },
  { code: "ja", name: "Japanese", native_name: "日本語", language_order: 6 },
];

const currencies = [
  { name: "USD", sign: "$", value: 1, is_default: 1 },
  { name: "EUR", sign: "EUR", value: 0.8524, is_default: 0 },
  { name: "CNY", sign: "CNY", value: 6.8283, is_default: 0 },
];

const menus = [
  { label: "Features", url: "#features", target: "_self", menu_order: 1 },
  { label: "Product", url: "#product", target: "_self", menu_order: 2 },
  { label: "Pricing", url: "#pricing", target: "_self", menu_order: 3 },
  { label: "For Families", url: "#family", target: "_self", menu_order: 4 },
  { label: "Cart", url: "/cart-checkout.html", target: "_self", menu_order: 5 },
];

const footerLinks = [
  { group_name: "Product", name: "Features", url: "#features", link_order: 1 },
  { group_name: "Product", name: "Pricing", url: "#pricing", link_order: 2 },
  { group_name: "Product", name: "For Families", url: "#family", link_order: 3 },
  { group_name: "Product", name: "Download the MyFrame App", url: "download-app", link_order: 4 },
  { group_name: "Support", name: "Help Center", url: "help-center", link_order: 1 },
  { group_name: "Support", name: "Contact Us", url: "contact-us", link_order: 2 },
  { group_name: "Support", name: "Privacy Policy", url: "privacy-policy", link_order: 3 },
  { group_name: "Support", name: "Terms of Service", url: "terms-of-service", link_order: 4 },
  { group_name: "Support", name: "Frequently Asked Questions", url: "faq", link_order: 5 },
  { group_name: "Company", name: "About MyFrame", url: "about", link_order: 1 },
  { group_name: "Company", name: "Blog", url: "blog", link_order: 2 },
  { group_name: "Company", name: "Press Kit", url: "press-kit", link_order: 3 },
  { group_name: "Company", name: "Documentation", url: "documentation", link_order: 4 },
];

const socials = [
  { icon: "fab fa-linkedin-in", url: "https://www.linkedin.com/", link_order: 1 },
  { icon: "fab fa-facebook-f", url: "https://www.facebook.com/", link_order: 2 },
  { icon: "fab fa-instagram", url: "https://www.instagram.com/", link_order: 3 },
  { icon: "fab fa-youtube", url: "https://www.youtube.com/", link_order: 4 },
  { icon: "x-social", url: "https://x.com/", link_order: 5 },
];

const features = [
  {
    icon: "fas fa-heart",
    image: "/assets/scenario-parents-far-away.png",
    title: "For parents far away",
    description:
      "Send a photo from your day and let it become a quiet moment at home, where your parents can enjoy it without opening another app.",
  },
  {
    icon: "fas fa-house-chimney-heart",
    image: "/assets/scenario-daily-family-life.png",
    title: "For daily family life",
    description:
      "Keep small moments visible: a child's smile, an ordinary afternoon, a weekend walk, or a simple hello from across town.",
  },
  {
    icon: "fas fa-gift",
    image: "/assets/scenario-weddings-gifts.png",
    title: "For weddings and gifts",
    description: "A meaningful gift can keep growing after the special day, becoming a living album for the home.",
  },
  {
    icon: "fas fa-cake-candles",
    image: "/assets/scenario-kids-birthday.png",
    title: "After birthday",
    description:
      "Keep birthday moments visible after the celebration, with little memories that stay warm long after the candles are out.",
  },
  {
    icon: "fas fa-palette",
    image: "/assets/scenario-art-room.png",
    title: "An art show in the room",
    description:
      "Use the display as a calm gallery corner for favorite artwork, travel photos, and the images that set the mood of a room.",
  },
  {
    icon: "fas fa-paw",
    image: "/assets/scenario-pets.png",
    title: "For animals and pets",
    description:
      "Let pet photos live somewhere warmer than the camera roll, from sleepy afternoons to the little chaos everyone loves.",
  },
];

const products = [
  {
    id: 1,
    sku: "YX-6",
    name: "YX-6",
    description: "Compact elegance",
    price: 160,
    currency: "USD",
    category_id: 1,
    badge: "Available Now",
    button_text: "Add to Cart",
    status: "publish",
    features: ['6" + 6 Color E-ink', "NFC & Bluetooth", "SD Card Support", "Memory Flashback", "Family sharing"],
    specs: { display: '6" + 6 Color', sdCard: true, nfc: true, bluetooth: true, wifi: false, notes: "" },
  },
  {
    id: 2,
    sku: "YX-6P",
    name: "YX-6P",
    description: "Compact elegance",
    price: 160,
    currency: "USD",
    category_id: 1,
    badge: "Coming Soon",
    button_text: "Notify Me",
    status: "publish",
    features: ['6" + 6 Color E-ink', "NFC & Bluetooth", "SD Card Support", "WiFi Connected", "Memory Flashback", "Family sharing"],
    specs: { display: '6" + 6 Color', sdCard: true, nfc: true, bluetooth: true, wifi: true, notes: "In development" },
  },
  {
    id: 3,
    sku: "YX-133P",
    name: "YX-133P",
    description: "Large format display",
    price: 360,
    currency: "USD",
    category_id: 1,
    badge: "Available Now",
    button_text: "Add to Cart",
    status: "publish",
    features: ['13.3" + 6 Color E-ink', "WiFi + MQTT Connected", "SD Card Support", "Up to 5 family members", "Memory Flashback", "Automated Care"],
    specs: { display: '13.3" + 6 Color', sdCard: true, nfc: true, bluetooth: true, wifi: true, notes: "" },
  },
];

const basic = {
  siteTitle: "MyFrame - Where Family Appears",
  themeColor: "#DC2626",
  gradientColor1: "#FEF2F2",
  gradientColor2: "#FFFFFF",
  gradientColor3: "#FECACA",
  darkMode: false,
  currencyDirection: "ltr",
  favicon: "/assets/myframe-logo-final.svg",
  headerLogo: "/assets/myframe-logo-final.svg",
  breadcrumbImage: "",
  heroBadge: "Where Family Appears",
  heroTitle: "Stay Close,",
  heroHighlight: "No Matter the Distance",
  heroSubtitle:
    "Send photos to your loved ones' frames instantly. They'll see your face every day, feeling your presence even when you're apart.",
  heroPrimaryButton: "Order Now - $360",
  heroSecondaryButton: "Watch Video",
  heroImageCaption: "Your photo will appear here",
  designedFeatureLabel: "Features",
  designedFeatureTitle: "Designed for Families",
  designedFeatureDescription: "Every feature crafted to bridge the distance between generations.",
  designedFeature1Title: "One-Care Message",
  designedFeature1Description:
    'Send "I am thinking of you" in one tap. Your family sees it on their frame instantly.',
  designedFeature2Title: "Memory Flashback",
  designedFeature2Description:
    "Relive special moments. Photos from the same day in previous years appear as delightful surprises.",
  designedFeature3Title: "Automated Care",
  designedFeature3Description: "Birthdays and holidays automatically remembered. Family stays connected.",
  designedFeature4Title: "QR Sharing",
  designedFeature4Description: "Elderly family members can receive photos by simply scanning a QR code.",
  designedFeature5Title: "2-Year Battery",
  designedFeature5Description: "E-ink display only uses power when changing. Set it and forget it.",
  designedFeature6Title: "Privacy First",
  designedFeature6Description: "Your photos stay private. Self-hosted AI, no cloud dependency.",
  featureLabel: "Made for Real Homes",
  featureTitle: "For the moments that deserve to stay visible",
  featureDescription:
    "MyFrame is for parents, couples, and families who want photos to become part of daily life, not disappear into a phone gallery.",
  productTitle: "Spectra 6 Display",
  productDescription:
    "The latest E-ink technology delivers 65,000 colors with a paper-like finish. No glare, no backlight — just natural, beautiful images that look like prints.",
  specsTitle: "Choose Your Frame",
  pricingTitle: "Simple, Transparent",
  pricingDescription: "One price. No subscriptions. No hidden fees.",
  familyTitle: "Family Connection,<br>Simplified",
  familyDescription:
    "Share moments through a mobile app experience that feels natural for families and comforting for the people who matter most.",
  heroStatusText: "Mobile app connected",
  heroProof1Label: "Thoughtful sync",
  heroProof2Label: "Beautiful home display",
  heroProof3Label: "Always-on connection",
  familyStep1Title: "Unbox and power on",
  familyStep1Description: "That's it. The frame connects to Wi‑Fi automatically.",
  familyStep2Title: "Invite family",
  familyStep2Description: "Send a QR code or invite link via WeChat, SMS, or email.",
  familyStep3Title: "Share photos instantly",
  familyStep3Description: "Photos appear on the frame within seconds.",
  specsLabel: "Specifications",
  specsDescription: "From compact to large format, find the perfect MyFrame for your space.",
  specsAsideTitle: "Built for everyday life",
  specsAsideBody:
    "MyFrame is designed first as a home object: low power, low glare, and quiet enough to live with for years.",
  specsNote1Title: "Color e-paper display",
  specsNote1Body: "Easy on the eyes with a natural, print-like look.",
  specsNote2Title: "Wireless home connection",
  specsNote2Body: "Moments arrive without asking family to learn a complicated new experience.",
  specsNote3Title: "Family-friendly hardware",
  specsNote3Body: "Compact options for desks and a larger format for shared spaces.",
  specDisplayTitle: '13.3" display',
  specDisplayDesc: "Great for any room",
  specRefreshTitle: "20s refresh",
  specRefreshDesc: "Calm, considered updates",
  specWifiTitle: "Wi‑Fi connected",
  specWifiDesc: "Photos delivered fast",
  specEcoTitle: "Eco-friendly",
  specEcoDesc: "Near-zero power when static",
  productLabel: "Aura Portrait",
};

const footer = {
  footerLogo: "/assets/myframe-logo-final.svg",
  footerBgImage: "",
  footerText: 'A device where family can "appear" anytime. Built with love for the ones who matter most.',
  copyrightText: "Copyright by @MyFrame - 2026",
};

const maintenance = { enabled: false, image: "", text: "We are improving the MyFrame website. Please check back soon." };

const media = {
  heroFrameImage: "",
  productShowcaseImage: "",
  familyPhoneImage1: "",
  familyPhoneImage2: "",
  breadcrumbImage: "",
  watchVideoUrl: "https://youtu.be/_8bVyx_Jiv8",
  appStoreUrl: "https://apps.apple.com/us/search?term=MyFrame",
  googlePlayUrl: "https://play.google.com/store/search?q=MyFrame&c=apps",
  miniAppUrl: "#",
  apkDownloadUrl: "#",
};

const seo = [
  {
    page_key: "home",
    page_name: "Home",
    meta_title: "MyFrame e-paper photo frame | family sharing, no subscription, private albums",
    meta_keywords:
      "MyFrame e-paper photo frame no subscription family gift eye protective digital frame private local storage long battery life",
    meta_description:
      "Shop MyFrame: colour e-paper photo frames for families—calm home display, private albums, mobile app pairing, and no subscription wall.",
  },
  {
    page_key: "cart",
    page_name: "Cart & Checkout",
    meta_title: "MyFrame Cart & Secure Checkout",
    meta_keywords: "MyFrame Cart & Secure Checkout",
    meta_description: "Review your MyFrame order and place a product order.",
  },
];

const gateways = [
  { code: "stripe", title: "Stripe", config: { publishableKey: "", secretKey: "", webhookSecret: "" } },
  { code: "paypal", title: "Paypal", config: { clientId: "", clientSecret: "", mode: "sandbox" } },
];

const translationsZh: Record<string, string> = {
  menuFeatures: "功能",
  menuProduct: "产品",
  menuPricing: "价格",
  menuFamilies: "家庭使用",
  menuCart: "购物车",
  buyForGift: "作为礼物购买",
  footerGroupProduct: "产品",
  footerGroupSupport: "支持",
  footerGroupCompany: "公司",
  footerGroupAccount: "账号",
  footerCustomerLogin: "客户登录",
  footerLoginBar: "客户登录 · 门户控制台",
  badgeAvailableNow: "现已发售",
  badgeComingSoon: "即将推出",
  badgeUnderDevelopment: "开发中",
  oneTimePurchase: "一次性购买",
  heroBadge: "让家人随时出现",
  heroTitle: "保持亲近，",
  heroHighlight: "不受距离限制",
  heroSubtitle: "将照片即时发送到亲人的相框，让陪伴每天都被看见。",
  heroPrimaryButton: "立即订购 - $360",
  heroSecondaryButton: "观看视频",
  heroImageCaption: "您的照片将显示在这里",
  addToCartButton: "加入购物车",
  notifyMeButton: "通知我",
  productTitle: "Spectra 6 显示屏",
  productDescription:
    "新一代电子墨水技术可呈现 65,000 种色彩，拥有纸张般的观感。无眩光、无背光，只留下自然细腻的画面。",
  featureLabel: "为真实家庭而生",
  featureTitle: "让值得珍藏的时刻一直可见",
  featureDescription:
    "MyFrame 适合父母、伴侣和家庭，让照片融入日常生活，而不是消失在手机相册里。",
  pricingTitle: "简单透明",
  pricingDescription: "一次购买，无订阅，无隐藏费用。",
  familyTitle: "家庭连接，<br>更简单",
  familyDescription: "通过微信、短信或邮件发送二维码或邀请链接，让远方的家人每天都能看见你的照片。",
  footerText: "一款让家人随时“出现”的设备，为最重要的人而打造。",
  specsTitle: "选择您的相框",
  notifyMeSuccess: "提交成功，我们会在产品开售时通知您。",
};

const zhScenarioFeatures = [
  { title: "给远方的父母", description: "把当天的一张照片发送过去，让它成为家中安静可见的片刻。" },
  { title: "给日常家庭生活", description: "让小小的日常一直可见：孩子的笑脸，或一句来自同城的问候。" },
  { title: "给婚礼和礼物", description: "有意义的礼物能在特别的一天之后继续生长，变成家中的相册。" },
  { title: "生日之后", description: "让庆祝过后的细小瞬间也一直留在家中。" },
  { title: "房间里的艺术展", description: "把喜欢的作品和旅行照片，变成安静的家庭画廊角落。" },
  { title: "给动物和宠物", description: "让宠物照片留在比相册更温暖的地方。" },
];

/** Persisted CMS payload (languages/currencies are merged at runtime from exports below). */
export function marketingSiteSeed() {
  return {
    basic: { ...basic },
    footer: { ...footer },
    maintenance: { ...maintenance },
    media: { ...media },
    translations: { zh: { ...translationsZh } },
    translatedFeatures: { zh: zhScenarioFeatures.map((item) => ({ ...item })) },
    contentPages: { en: {}, zh: {} },
    seo: seo.map((row) => ({ ...row })),
    menus: menus.map((row) => ({ ...row })),
    footerLinks: footerLinks.map((row) => ({ ...row })),
    socials: socials.map((row) => ({ ...row })),
    features: features.map((row) => ({ ...row })),
    products: products.map((row) => ({ ...row })),
    gateways: gateways.map((row) => ({ ...row })),
  };
}

export type MarketingSiteStored = ReturnType<typeof marketingSiteSeed>;

export const staticLanguages = languages;
export const staticCurrencies = currencies;
