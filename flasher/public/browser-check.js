// MyFrame Flasher — browser gate.
// The tool depends on Web Serial API, which only ships in Chromium-based
// browsers (Chrome, Edge Chromium, Opera, Brave). Safari and Firefox do not
// implement it and there is no polyfill for our use case. Rather than let the
// user hit a cryptic error after clicking around, we fail fast on load with a
// clear "please use Chrome" screen.

const CHROME_URL = 'https://www.google.com/chrome/';

// Return { ok, kind } where `kind` is a coarse browser family used to pick
// the right copy for the block screen.
export function detectBrowser() {
  const ua = navigator.userAgent || '';
  const uaLower = ua.toLowerCase();
  const hasSerial = 'serial' in navigator;

  // Order matters: check specific browsers before generic Chrome, because
  // Edge/Opera/Brave/DuckDuckGo all include "Chrome" in their UA.
  let kind = 'unknown';
  if (/firefox\//i.test(ua))                        kind = 'firefox';
  else if (/edg\//i.test(ua))                       kind = 'edge';       // Edge Chromium
  else if (/opr\/|opera/i.test(ua))                 kind = 'opera';
  else if (/brave/i.test(uaLower) || navigator.brave) kind = 'brave';
  else if (/chrome\/|chromium\//i.test(ua))         kind = 'chrome';
  else if (/safari\//i.test(ua) && /apple/i.test(navigator.vendor || '')) kind = 'safari';

  // Chromium-family + Web Serial is what we actually need. Chrome / Edge /
  // Opera / Brave all satisfy this in practice, so let them through.
  const isChromium = ['chrome', 'edge', 'opera', 'brave'].includes(kind);
  return { ok: hasSerial && isChromium, kind, hasSerial, ua };
}

// Tailored guidance per detected browser family.
const COPY = {
  zh: {
    title: '请使用 Chrome 浏览器',
    subtitle: '本工具需要 Web Serial API，仅 Chrome / Edge / Opera / Brave 等 Chromium 内核浏览器可用。',
    perBrowser: {
      safari:  '你正在使用 Safari — 无法运行本工具。请下载 Chrome 后重开链接。',
      firefox: '你正在使用 Firefox — 无法运行本工具。请下载 Chrome 后重开链接。',
      unknown: '未检测到 Web Serial 支持。请下载 Chrome 后重开链接。',
      generic: '本工具需要 Chrome / Edge / Chromium 内核浏览器。',
    },
    detected:   '检测到浏览器',
    downloadBtn: '下载 Chrome',
    copyBtn:     '复制当前链接',
    copied:      '已复制到剪贴板',
    urlLabel:    '本页 URL',
    reason:      '技术原因：Web Serial API 未实现',
  },
  en: {
    title: 'Please use Google Chrome',
    subtitle: 'This tool needs the Web Serial API, which ships in Chromium-based browsers only (Chrome / Edge / Opera / Brave).',
    perBrowser: {
      safari:  'You are on Safari — the tool cannot run here. Please download Chrome and reopen this link.',
      firefox: 'You are on Firefox — the tool cannot run here. Please download Chrome and reopen this link.',
      unknown: 'Web Serial support was not detected. Please download Chrome and reopen this link.',
      generic: 'This tool needs Chrome / Edge / a Chromium-based browser.',
    },
    detected:    'Detected browser',
    downloadBtn: 'Download Chrome',
    copyBtn:     'Copy this URL',
    copied:      'Copied to clipboard',
    urlLabel:    'This page',
    reason:      'Technical reason: Web Serial API not implemented',
  },
};

function pickLang() {
  const url = new URL(window.location.href);
  const q = url.searchParams.get('lang');
  if (q === 'en' || q === 'zh') return q;
  const stored = localStorage.getItem('myframe-flasher-lang');
  if (stored === 'en' || stored === 'zh') return stored;
  return (navigator.language || 'zh').toLowerCase().startsWith('en') ? 'en' : 'zh';
}

// Render the full-screen block page in place of the normal app UI.
export function renderBlockScreen(det) {
  const lang = pickLang();
  const s = COPY[lang];
  const msgKey = det.kind in s.perBrowser ? det.kind : (det.hasSerial ? 'generic' : 'unknown');

  document.title = s.title;
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  document.body.innerHTML = `
    <div class="block-screen">
      <div class="block-card">
        <div class="block-icon">⚠</div>
        <h1 class="block-title">${s.title}</h1>
        <p class="block-subtitle">${s.subtitle}</p>
        <p class="block-tailored">${s.perBrowser[msgKey]}</p>

        <div class="block-actions">
          <a class="block-btn block-btn--primary" href="${CHROME_URL}" target="_blank" rel="noopener">
            ${s.downloadBtn} ↗
          </a>
          <button class="block-btn block-btn--ghost" id="blockCopyBtn">${s.copyBtn}</button>
        </div>

        <dl class="block-meta">
          <dt>${s.urlLabel}</dt><dd class="mono block-url">${window.location.href}</dd>
          <dt>${s.detected}</dt><dd class="mono">${det.kind}${det.hasSerial ? '' : ' · no Web Serial'}</dd>
          <dt>User-Agent</dt><dd class="mono block-ua">${det.ua}</dd>
        </dl>

        <p class="block-reason">${s.reason}</p>
      </div>
    </div>
  `;

  document.getElementById('blockCopyBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      const btn = document.getElementById('blockCopyBtn');
      const orig = btn.textContent;
      btn.textContent = s.copied;
      btn.disabled = true;
      setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000);
    } catch (_) {
      // Clipboard API may fail on non-secure origins; degrade silently.
    }
  });
}

// Convenience: check on load and stop the app if unsupported. Returns true
// when the app is allowed to continue.
export function assertSupported() {
  const det = detectBrowser();
  if (!det.ok) {
    renderBlockScreen(det);
    return false;
  }
  return true;
}
