import fs from "fs";
import path from "path";
import Script from "next/script";
import { defaultLocale, isLocale, type Locale } from "@/lib/i18n";

function homeMarkup(): string {
  const p = path.join(process.cwd(), "marketing-templates", "home-markup.html");
  return fs.readFileSync(p, "utf8");
}

type Props = { params: Promise<{ locale: string }> };

export default async function MarketingLandingPage({ params }: Props) {
  const { locale: raw } = await params;
  const locale: Locale = isLocale(raw) ? raw : defaultLocale;
  void locale;

  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: homeMarkup() }} suppressHydrationWarning />
      <Script src="/site-runtime.js" strategy="afterInteractive" />
      <Script id="myframe-marketing-widgets" strategy="afterInteractive">{`
(function initHeroCarousel() {
  const slides = Array.from(document.querySelectorAll('.hero-slide'));
  const shell = document.querySelector('.hero-shell');
  const prev = document.querySelector('[data-hero-prev]');
  const next = document.querySelector('[data-hero-next]');
  if (!slides.length) return;
  let activeIndex = 0;
  let timer = null;
  function showSlide(index) {
    activeIndex = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => slide.classList.toggle('is-active', i === activeIndex));
    if (shell) shell.dataset.activeSlide = String(activeIndex);
    if (prev) prev.classList.toggle('is-hidden', activeIndex === 0);
  }
  function restartTimer() {
    window.clearInterval(timer);
    timer = window.setInterval(() => showSlide(activeIndex + 1), 3000);
  }
  prev?.addEventListener('click', () => { showSlide(activeIndex - 1); restartTimer(); });
  next?.addEventListener('click', () => { showSlide(activeIndex + 1); restartTimer(); });
  showSlide(0);
  restartTimer();
})();
function updateWebsiteNavCartBadge() {
  var badge = document.getElementById('navCartBadge');
  if (!badge) return;
  var cart = JSON.parse(localStorage.getItem('frampCart') || '{}');
  var count = Object.values(cart).reduce(function (sum, qty) { return sum + qty; }, 0);
  badge.textContent = String(count);
  badge.style.display = count > 0 ? 'inline-flex' : 'none';
}
updateWebsiteNavCartBadge();
(function initMobileMenu() {
  var toggle = document.getElementById('mobileMenuToggle');
  var menu = document.getElementById('mobileMenu');
  if (!toggle || !menu) return;
  function close() {
    menu.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }
  toggle.addEventListener('click', function () {
    var open = !menu.classList.contains('open');
    menu.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });
  menu.querySelectorAll('a').forEach(function (link) { link.addEventListener('click', close); });
  window.addEventListener('resize', function () { if (window.innerWidth > 1120) close(); });
})();
window.addEventListener('storage', function (event) {
  if (event.key === 'frampCart') updateWebsiteNavCartBadge();
});
      `}</Script>
    </>
  );
}
