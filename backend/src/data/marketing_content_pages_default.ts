/**
 * Fallback HTML for marketing footer/info slugs merged into GET /api/public/site
 * (`contentPages`) when CMS rows are missing. Editors in manage.html override per field.
 */

export type DefaultContentDoc = {
  title: string;
  excerpt?: string;
  body: string;
};

const sharedHelp =
  '<p>Browse guides in the Documentation section or email <a href="mailto:support@myframetech.co">support@myframetech.co</a> for product questions.</p>';

export const marketingContentPagesDefault: Record<string, Record<string, DefaultContentDoc>> = {
  en: {
    "download-app": {
      title: "Download the MyFrame app",
      excerpt: "Get the companion app on your phone.",
      body: `<p>Install the official MyFrame app to pair frames, manage albums, and send photos securely.</p>
        <ul><li>Search <strong>MyFrame</strong> on the Apple App Store or Google Play.</li><li>Open the app and follow pairing steps shown on your frame.</li></ul>${sharedHelp}`,
    },
    "help-center": {
      title: "Help Center",
      excerpt: "Find answers about setup, pairing, and shipping.",
      body: `<p>We aggregate quick answers across setup, pairing, uploads, shipping, and account questions.</p>
        <h2>Popular topics</h2><ul><li>Pairing a new frame via Bluetooth/NFC.</li><li>Supported image formats &amp; display tips.</li><li>Returns and warranties — see Terms of Service.</li></ul>${sharedHelp}`,
    },
    "contact-us": {
      title: "Contact us",
      excerpt: "We're here for sales, product support, and press.",
      body: `<p>For order or device support, reach us at <a href="mailto:support@myframetech.co">support@myframetech.co</a>.</p>
        <p>For business or press inquiries: <a href="mailto:partnerships@myframetech.co">partnerships@myframetech.co</a>.</p>`,
    },
    "privacy-policy": {
      title: "Privacy Policy",
      excerpt: "How we collect, use, and protect personal data.",
      body: `<p><strong>Last updated:</strong> This is a concise summary; final legal text belongs in counsel-reviewed documents.</p>
        <h2>What we collect</h2><p>Account identifiers you provide when you shop or pair a device (email, billing details for orders), diagnostics our support team needs to troubleshoot, and imagery you voluntarily send through the app intended for frames you control.</p>
        <h2>How we use data</h2><p>To fulfill orders, provide product features, comply with applicable law, and improve reliability and safety of our systems.</p>
        <h2>Choices &amp; contact</h2><p>For privacy requests applicable in your jurisdiction, contact <a href="mailto:support@myframetech.co">support@myframetech.co</a>.</p>`,
    },
    "terms-of-service": {
      title: "Terms of Service",
      excerpt: "Rules governing use of MyFrame hardware, apps, and the website.",
      body: `<p><strong>Note:</strong> Replace with jurisdiction-specific counsel-approved terms before production launch.</p>
        <h2>Use of hardware &amp; software</h2><p>Products are supplied as described on product pages at time of sale. Companion software may update for security and compatibility.</p>
        <h2>Orders</h2><p>Prices, taxes, shipping, returns, and warranty limitations are communicated at checkout and in order confirmations.</p>
        <h2>Disclaimer</h2><p>Services are offered on an <em>as available</em> basis; uninterrupted operation is not guaranteed.</p>`,
    },
    faq: {
      title: "FAQ",
      excerpt: "Shortcut answers.",
      body: `<h2>Is there a subscription?</h2><p>MyFrame emphasizes one-time purchases for hardware; companion app downloads are outlined on product listings.</p>
        <h2>Supported photos</h2><p>See Documentation for sizing and color-profile guidance tuned for Spectra displays.</p>
        <h2>Shipping timelines</h2><p>Shown at checkout; carriers may quote separate delivery windows.</p>${sharedHelp}`,
    },
    about: {
      title: "About MyFrame",
      excerpt: "We build calm displays for memorable photos.",
      body: `<p>MyFrame brings family imagery into the room with matte, paper-like surfaces made for sustained viewing—not endless scrolling feeds.</p>
        <p>We obsess over display quality, private sharing, and long-term ownership without needless forced subscriptions.</p>`,
    },
    blog: {
      title: "Blog",
      excerpt: "Product updates & stories.",
      body: `<p>Long-form articles live on our <a href="/blog.html">Blog</a> landing page alongside release notes.</p>`,
    },
    "press-kit": {
      title: "Press kit",
      excerpt: "Logos and short facts.",
      body: `<p>For brand assets &amp; product factsheets, email <a href="mailto:press@myframetech.co">press@myframetech.co</a> with your outlet and timeline.</p>
        <p>High-resolution logo files can be zipped on request pending approval.</p>`,
    },
    documentation: {
      title: "Documentation",
      excerpt: "Specs, pairing guides, safe upload tips.",
      body: `<h2>Pairing &amp; network</h2><p>Open the companion app → follow on-screen NFC/Bluetooth cues to claim your frame.</p>
        <h2>Imagery workflow</h2><p>Images are quantized for six-color Spectra pipelines; originals stay on your controlled devices unless you choose cloud backup features.</p>
        <p>Need specifics? Reach <a href="mailto:support@myframetech.co">support@myframetech.co</a>.</p>`,
    },
  },
  zh: {
    "download-app": {
      title: "下载 App",
      excerpt: "在手机上安装配套应用",
      body: "<p>在 App Store / Google Play 搜索 <strong>MyFrame</strong> ，按相框指引完成配对与发送照片。</p>",
    },
    "help-center": {
      title: "帮助中心",
      excerpt: "设置、配对、物流相关说明",
      body: "<p>涵盖配对、相册与物流等常见问题。如需人工支持，请联系 <a href=\"mailto:support@myframetech.co\">support@myframetech.co</a>。</p>",
    },
    "contact-us": {
      title: "联系我们",
      excerpt: "",
      body: "<p>订单与技术支持：<a href=\"mailto:support@myframetech.co\">support@myframetech.co</a></p>",
    },
    "privacy-policy": {
      title: "隐私政策",
      excerpt: "",
      body: "<p>此处提供简要说明，正式发布前请以法务审核文案为准。</p>",
    },
    "terms-of-service": {
      title: "服务条款",
      excerpt: "",
      body: "<p>此处提供简要占位内容，请以正式法务版本替换。</p>",
    },
    faq: {
      title: "常见问题",
      excerpt: "",
      body: "<p>关于订阅模式、相册与退换货请以结账页及产品说明为准。</p>",
    },
    about: {
      title: "关于 MyFrame",
      excerpt: "",
      body: "<p>我们为家庭与传统照片留念打造适合长时间观看的哑光显示体验。</p>",
    },
    blog: {
      title: "博客",
      excerpt: "",
      body: "<p>请参阅 <a href=\"/blog.html\">博客聚合页</a>。</p>",
    },
    "press-kit": {
      title: "媒体资料包",
      excerpt: "",
      body: "<p>媒体问询请写信至 <a href=\"mailto:press@myframetech.co\">press@myframetech.co</a>。</p>",
    },
    documentation: {
      title: "文档",
      excerpt: "",
      body: "<p>配对与安全上传说明请咨询支持邮箱或稍后发布的详细文档章节。</p>",
    },
  },
};
