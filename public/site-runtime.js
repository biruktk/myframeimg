(async function () {
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  /** 502 payloads can be `{ ok: false }` JSON (truthy) — previously we cleared `.nav-links` with empty menus. */
  let json = null;
  const siteRes = await fetch('/api/public/site', { credentials: 'same-origin' }).catch(() => null);
  if (siteRes) {
    try {
      if (siteRes.ok) {
        json = await siteRes.json();
      }
    } catch (_) {}
  }
  const siteBad =
    !json ||
    typeof json !== 'object' ||
    json.ok === false ||
    !Array.isArray(json.menus) ||
    json.menus.length < 1;
  if (siteBad) {
    const status = siteRes && typeof siteRes.status === 'number' ? siteRes.status : 'offline';
    console.warn(
      '[MyFrame] /api/public/site is not returning a usable marketing payload (HTTP ' +
        status +
        '). Keeping static homepage nav/footer markup. Tip: run the API from web/backend (`npm run dev`, default http://127.0.0.1:3001) or rely on Next’s bundled fallback if configured.'
    );
    return;
  }

  const basic = json.basic || {};
  const footer = json.footer || {};
  const maintenance = json.maintenance || {};
  const media = json.media || {};
  const watchVideoUrl = String(media.watchVideoUrl || '').trim() || 'https://youtu.be/_8bVyx_Jiv8';
  const languages = json.languages || [];
  const locRes = await fetch('/api/public/location', { credentials: 'same-origin' }).catch(() => null);
  let geo = { recommendedLanguage: 'en', recommendedCurrency: 'USD' };
  if (locRes && locRes.ok) {
    try {
      const parsed = await locRes.json();
      if (parsed && typeof parsed === 'object' && parsed.ok !== false) geo = parsed;
    } catch (_) {}
  }
  const currentLang = resolveLanguage(languages, geo.recommendedLanguage);

  // Persist language preference (path / IP / saved) so future visits skip the lookup
  // and the server can serve the right language directly via the myframe_lang cookie.
  const langCodes = languages.map((item) => item.code);
  const pathFirstSegment = location.pathname.split('/').filter(Boolean)[0];
  const explicitPathLang = langCodes.includes(pathFirstSegment) ? pathFirstSegment : '';
  const savedLangPref = (() => { try { return localStorage.getItem('myframeLang'); } catch (_) { return null; } })();

  function persistLang(code) {
    if (!langCodes.includes(code)) return;
    try { localStorage.setItem('myframeLang', code); } catch (_) {}
    try {
      document.cookie = `myframe_lang=${code}; path=/; max-age=31536000; SameSite=Lax`;
    } catch (_) {}
  }

  // First-time visitor on the homepage with an IP-detected non-English language —
  // auto-redirect to /{lang} so the URL matches the content. The dropdown still lets
  // them switch back; manual choices are respected on the next visit.
  if (!explicitPathLang && !savedLangPref && currentLang !== 'en' && langCodes.includes(currentLang)) {
    persistLang(currentLang);
    location.replace(`/${currentLang}${location.search || ''}${location.hash || ''}`);
    return;
  }

  // Persist only an EXPLICIT URL choice (e.g. visiting /zh directly). Do NOT persist
  // the English fallback — otherwise a saved 'en' would block future IP-based
  // detection if the user later browses through a different country (e.g. via VPN).
  if (explicitPathLang) {
    persistLang(explicitPathLang);
  }
  const currentCurrency = resolveCurrency(json.currencies || [], geo.recommendedCurrency, currentLang);
  const translated = currentLang === 'en' ? {} : (json.translations || {})[currentLang] || {};
  const translatedFeatures = currentLang === 'en' ? [] : (json.translatedFeatures || {})[currentLang] || [];
  const view = { ...basic, ...translated };
  const localizedPages = json.contentPages?.[currentLang] || json.contentPages?.en || {};

  if (maintenance.enabled) {
    document.body.innerHTML = `<main style="min-height:100vh;display:grid;place-items:center;text-align:center;padding:24px;background:#FEF2F2;color:#1A1A1A;font-family:-apple-system,BlinkMacSystemFont,sans-serif;"><div><img src="${esc(maintenance.image || basic.headerLogo || '/assets/myframe-logo-final.svg')}" alt="" style="max-width:180px;max-height:100px;margin-bottom:22px;"><h1 style="font-size:42px;margin-bottom:12px;">Maintenance Mode</h1><p style="font-size:18px;color:#666;max-width:560px;">${esc(maintenance.text)}</p></div></main>`;
    return;
  }

  document.documentElement.lang = currentLang;
  document.body.classList.toggle('zh', currentLang === 'zh');
  injectHreflang(languages);
  const homeSeo = (json.seo || []).find((item) => item.page_key === 'home') || {};
  const homeTitleFromSeo = homeSeo.meta_title && String(homeSeo.meta_title).trim();
  document.title = homeTitleFromSeo || view.siteTitle || basic.siteTitle || document.title;
  setMeta('keywords', homeSeo.meta_keywords);
  setMeta('description', homeSeo.meta_description);
  setMeta('robots', 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1');
  setMeta('theme-color', basic.themeColor || '#DC2626');
  setPropertyMeta('og:title', document.title);
  setPropertyMeta('og:description', homeSeo.meta_description);
  setPropertyMeta('og:url', currentLang === 'en' ? `${location.origin}/` : `${location.origin}/${currentLang}`);
  setPropertyMeta('og:type', 'website');
  setPropertyMeta('og:site_name', 'MyFrame');
  const ogImg = basic.headerLogo ? `${location.origin}${basic.headerLogo}` : `${location.origin}/assets/myframe-logo-final.svg`;
  setPropertyMeta('og:image', ogImg);
  setPropertyMeta('twitter:title', document.title);
  setPropertyMeta('twitter:description', homeSeo.meta_description);
  setPropertyMeta('twitter:card', 'summary_large_image');
  setPropertyMeta('twitter:image', ogImg);
  setCanonical(currentLang === 'en' ? `${location.origin}/` : `${location.origin}/${currentLang}`);

  document.documentElement.style.setProperty('--primary', basic.themeColor || '#DC2626');
  document.documentElement.style.setProperty('--primary-dark', shadeColor(basic.themeColor || '#DC2626', -18));
  document.documentElement.style.setProperty('--primary-light', basic.gradientColor1 || '#FEE2E2');

  document.querySelectorAll('.brand-logo').forEach((img) => {
    if (basic.headerLogo) img.src = basic.headerLogo;
  });

  renderNav(json.menus || [], languages, currentLang);
  localizeStaticLinks(currentLang);
  setText('.hero-badge', view.heroBadge, true);
  setText('#heroFrameCaption', view.heroImageCaption);
  const h1 = document.querySelector('.hero h1');
  if (h1 && (view.heroTitle || view.heroHighlight)) h1.innerHTML = `${esc(view.heroTitle || '')}<br><span>${esc(view.heroHighlight || '')}</span>`;
  setText('.hero-subtitle', view.heroSubtitle);
  setHeroProof(view);
  setText('.hero-status-pill', view.heroStatusText);
  const heroVideoBtn = document.getElementById('heroVideoBtn');
  if (heroVideoBtn) {
    const label = heroVideoBtn.querySelector('span');
    if (label && view.heroSecondaryButton) label.textContent = view.heroSecondaryButton;
    heroVideoBtn.setAttribute('href', watchVideoUrl);
    heroVideoBtn.addEventListener('click', (event) => {
      event.preventDefault();
      openVideo(watchVideoUrl);
    });
  }

  setText('#features .section-label', view.featureLabel);
  setText('#features .section-title', view.featureTitle);
  setText('#features .section-desc', view.featureDescription);
  setText('.product-info h2', view.productTitle);
  setText('.product-info p', view.productDescription);
  setText('#productShowcaseLabel', view.productLabel);
  setText('#specs .section-label', view.specsLabel);
  setText('#specs .section-title', view.specsTitle);
  setText('#specs .section-desc', view.specsDescription);
  setText('#pricing .section-title', view.pricingTitle);
  setText('#pricing .section-desc', view.pricingDescription);
  setSpecsAside(view);
  const familyTitle = document.querySelector('.family-content h2');
  if (familyTitle && view.familyTitle) familyTitle.innerHTML = view.familyTitle;
  setText('.family-content > p', view.familyDescription);
  setFamilySteps(view);
  setDesignedFeatures(view);

  renderMedia(media, view);
  renderFeatures(json.features || [], translatedFeatures);
  renderProducts(json.products || [], translated, currentCurrency, json.currencies || []);
  renderSpecs(translated);
  renderFooter({ ...footer, footerText: translated.footerText || footer.footerText }, json.footerLinks || [], json.socials || [], currentLang, localizedPages, translated);
  window.myframeCatalog = Object.fromEntries((json.products || []).map((p) => [p.sku, { id: p.id, price: Number(p.price), desc: p.description, name: p.name, currency: p.currency }]));
  localStorage.setItem('myframeCurrency', currentCurrency);
  updateCartBadge();

  function renderNav(menus, activeLanguages, lang) {
    const nav = document.querySelector('.nav-links');
    const select = document.getElementById('languageSelect');
    const cta = document.querySelector('.nav-cta');
    const logo = document.querySelector('.nav-logo');
    if (nav) {
      nav.innerHTML = menus.map((item) => {
        const isCart = /cart/i.test(item.label) || /cart-checkout/.test(item.url);
        return `<a href="${esc(localizeMenuUrl(item.url, currentLang))}" target="${esc(item.target || '_self')}" class="${isCart ? 'nav-cart-link' : ''}">${esc(translateMenuLabel(item))}${isCart ? ' <span id="navCartBadge" class="cart-badge">0</span>' : ''}</a>`;
      }).join('');
    }
    if (logo) logo.href = lang === 'en' ? '/' : `/${lang}`;
    if (cta) {
      cta.innerHTML = `<i class="fas fa-gift"></i> ${esc(view.buyForGift || 'Buy for Gift')}`;
      cta.href = lang === 'en' ? `/cart-checkout.html?add=YX-133P` : `/${lang}/cart?add=YX-133P`;
    }
    if (select) {
      select.innerHTML = activeLanguages.map((item) => `<option value="${esc(item.code)}" ${item.code === lang ? 'selected' : ''}>${esc(item.native_name || item.name)}</option>`).join('');
      select.addEventListener('change', () => {
        try { localStorage.setItem('myframeLang', select.value); } catch (_) {}
        try { localStorage.setItem('myframeCurrency', currencyForLanguage(select.value)); } catch (_) {}
        try {
          document.cookie = `myframe_lang=${select.value}; path=/; max-age=31536000; SameSite=Lax`;
        } catch (_) {}
        location.href = select.value === 'en' ? '/' : `/${select.value}`;
      });
    }
    updateCartBadge();
  }

  function setFamilySteps(data) {
    const steps = document.querySelectorAll('.family-step');
    if (steps[0]) {
      steps[0].querySelector('h4').textContent = data.familyStep1Title || steps[0].querySelector('h4').textContent;
      steps[0].querySelector('p').textContent = data.familyStep1Description || steps[0].querySelector('p').textContent;
    }
    if (steps[1]) {
      steps[1].querySelector('h4').textContent = data.familyStep2Title || steps[1].querySelector('h4').textContent;
      steps[1].querySelector('p').textContent = data.familyStep2Description || steps[1].querySelector('p').textContent;
    }
    if (steps[2]) {
      steps[2].querySelector('h4').textContent = data.familyStep3Title || steps[2].querySelector('h4').textContent;
      steps[2].querySelector('p').textContent = data.familyStep3Description || steps[2].querySelector('p').textContent;
    }
  }

  function setDesignedFeatures(data) {
    setText('#designed .section-label', data.designedFeatureLabel);
    setText('#designed .section-title', data.designedFeatureTitle);
    setText('#designed .section-desc', data.designedFeatureDescription);
    const cards = document.querySelectorAll('.family-feature-card');
    for (let i = 0; i < cards.length; i += 1) {
      const title = data[`designedFeature${i + 1}Title`];
      const description = data[`designedFeature${i + 1}Description`];
      if (title) cards[i].querySelector('h3').textContent = title;
      if (description) cards[i].querySelector('p').textContent = description;
    }
  }

  function setHeroProof(data) {
    const items = document.querySelectorAll('.hero-proof-item');
    if (items[0] && data.heroProof1Label) items[0].querySelector('span').textContent = data.heroProof1Label;
    if (items[1] && data.heroProof2Label) items[1].querySelector('span').textContent = data.heroProof2Label;
    if (items[2] && data.heroProof3Label) items[2].querySelector('span').textContent = data.heroProof3Label;
  }

  function setSpecsAside(data) {
    setText('.specs-aside h3', data.specsAsideTitle);
    setText('.specs-aside > p', data.specsAsideBody);
    const notes = document.querySelectorAll('.specs-note');
    if (notes[0]) {
      notes[0].querySelector('strong').textContent = data.specsNote1Title || notes[0].querySelector('strong').textContent;
      notes[0].querySelector('span').textContent = data.specsNote1Body || notes[0].querySelector('span').textContent;
    }
    if (notes[1]) {
      notes[1].querySelector('strong').textContent = data.specsNote2Title || notes[1].querySelector('strong').textContent;
      notes[1].querySelector('span').textContent = data.specsNote2Body || notes[1].querySelector('span').textContent;
    }
    if (notes[2]) {
      notes[2].querySelector('strong').textContent = data.specsNote3Title || notes[2].querySelector('strong').textContent;
      notes[2].querySelector('span').textContent = data.specsNote3Body || notes[2].querySelector('span').textContent;
    }
  }

  function renderMedia(siteMedia, data) {
    replaceMedia('heroFrameMedia', siteMedia.heroFrameImage, data.heroImageCaption);
    replaceMedia('productShowcaseMedia', siteMedia.productShowcaseImage, data.productLabel);
  }

  function replaceMedia(id, src, caption) {
    const root = document.getElementById(id);
    if (!root || !src) return;
    root.innerHTML = `<img src="${esc(src)}" alt="${esc(caption || 'MyFrame image')}" style="max-width:100%;max-height:100%;object-fit:cover;border-radius:12px;">`;
  }

  function setText(selector, value, keepIcon) {
    const el = document.querySelector(selector);
    if (!el || !value) return;
    if (keepIcon && el.querySelector('i')) el.innerHTML = `${el.querySelector('i').outerHTML} ${esc(value)}`;
    else el.textContent = value;
  }

  function setMeta(name, content) {
    if (!content) return;
    let tag = document.querySelector(`meta[name="${name}"]`);
    if (!tag) {
      tag = document.createElement('meta');
      tag.name = name;
      document.head.appendChild(tag);
    }
    tag.content = content;
  }

  function setPropertyMeta(property, content) {
    if (!content) return;
    let tag = document.querySelector(`meta[property="${property}"]`) || document.querySelector(`meta[name="${property}"]`);
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute(property.startsWith('og:') ? 'property' : 'name', property);
      document.head.appendChild(tag);
    }
    tag.content = content;
  }

  function setCanonical(url) {
    if (!url) return;
    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = url;
  }

  function renderFeatures(features, translatedItems) {
    const grid = document.querySelector('.features-grid');
    if (!grid || !features.length) return;
    grid.innerHTML = features.map((f, index) => {
      const translatedItem = translatedItems[index] || {};
      const image = f.image ? `<img class="feature-image" src="${esc(f.image)}" alt="${esc(translatedItem.title || f.title)}">` : `<div class="feature-icon"><i class="${esc(f.icon || 'fas fa-heart')}"></i></div>`;
      return `<div class="feature-card">${image}<h3 class="feature-title">${esc(translatedItem.title || f.title)}</h3><p class="feature-desc">${esc(translatedItem.description || f.description)}</p></div>`;
    }).join('');
  }

  function renderProducts(products, translatedView, currencyCode, currencies) {
    const cards = document.querySelector('.pricing-cards');
    if (cards && products.length) {
      cards.innerHTML = products.map((p, index) => {
        const defaultDesc = p.sku === 'YX-6' || p.sku === 'YX-6P' ? 'Compact elegance' : p.sku === 'YX-133P' ? 'Large format display' : p.description;
        const translatedDesc = translatedView[`product${index + 1}Description`] || defaultDesc;
        const translatedFeatures = toArray(translatedView[`product${index + 1}Features`]).length ? toArray(translatedView[`product${index + 1}Features`]) : toArray(p.features);
        const translatedButton = p.badge && /coming/i.test(String(p.badge)) ? (translatedView.notifyMeButton || 'Notify Me') : (translatedView.addToCartButton || p.button_text || 'Add to Cart');
        const target = currentLang === 'en' ? `/cart-checkout.html?add=${encodeURIComponent(p.sku)}` : `/${currentLang}/cart?add=${encodeURIComponent(p.sku)}`;
        const isComingSoon = p.badge && /coming/i.test(String(p.badge));
        const action = isComingSoon
          ? `type="button" data-notify-sku="${esc(p.sku)}" data-notify-name="${esc(p.name)}" onclick="window.openNotifyModal && window.openNotifyModal(this.dataset.notifySku, this.dataset.notifyName)"`
          : `type="button" onclick="window.location.href='${esc(target)}'"`;
        const badge = p.badge && /available/i.test(String(p.badge)) ? `<div class="pricing-badge">${esc(translateBadge(p.badge))}</div>` : '';
        const period = p.sku === 'YX-6' || p.sku === 'YX-6P' ? '6" E-ink display' : (translatedView.oneTimePurchase || 'One-time purchase');
        const priceLabel = p.sku === 'YX-6P' ? (translatedView.badgeComingSoon || 'Coming Soon') : formatPrice(Number(p.price), currencyCode, currencies);
        return `<div class="pricing-card ${p.badge && /available/i.test(p.badge) ? 'featured' : ''}">${badge}<h3 class="pricing-name">${esc(p.name)}</h3><p class="pricing-desc">${esc(translatedDesc)}</p><div class="pricing-price">${esc(priceLabel)}</div><p class="pricing-period">${esc(period)}</p><ul class="pricing-features">${translatedFeatures.map((f) => `<li><i class="fas fa-check"></i> ${esc(f)}</li>`).join('')}</ul><button class="pricing-btn ${p.badge && /available/i.test(p.badge) ? 'pricing-btn-primary' : 'pricing-btn-secondary'}" ${action}>${esc(translatedButton)}</button></div>`;
      }).join('');
    }
  }

  function renderSpecs(translatedView) {
    const headers = document.querySelectorAll('.specs-table thead th');
    const rows = document.querySelectorAll('.specs-table tbody tr');
    if (headers[0]) headers[0].textContent = translatedView.specTableModel || 'Model';
    if (headers[1]) headers[1].textContent = translatedView.specTableDisplay || 'Display';
    if (headers[2]) headers[2].textContent = translatedView.specTableSdCard || 'SD Card';
    if (headers[3]) headers[3].textContent = translatedView.specTableNfc || 'NFC';
    if (headers[4]) headers[4].textContent = translatedView.specTableBluetooth || 'Bluetooth';
    if (headers[5]) headers[5].textContent = translatedView.specTableWifi || 'Wi-Fi';
    if (headers[6]) headers[6].textContent = translatedView.specTableNotes || 'Notes';
    if (rows[1]) {
      const badge = rows[1].querySelector('.spec-badge');
      if (badge) badge.textContent = translatedView.frameChoicePortableMeta || 'In development';
    }
    const specRows = document.querySelectorAll('.product-specs .spec-item');
    if (specRows[0]) {
      specRows[0].querySelector('h4').textContent = translatedView.specDisplayTitle || specRows[0].querySelector('h4').textContent;
      specRows[0].querySelector('p').textContent = translatedView.specDisplayDesc || specRows[0].querySelector('p').textContent;
    }
    if (specRows[1]) {
      specRows[1].querySelector('h4').textContent = translatedView.specRefreshTitle || specRows[1].querySelector('h4').textContent;
      specRows[1].querySelector('p').textContent = translatedView.specRefreshDesc || specRows[1].querySelector('p').textContent;
    }
    if (specRows[2]) {
      specRows[2].querySelector('h4').textContent = translatedView.specWifiTitle || specRows[2].querySelector('h4').textContent;
      specRows[2].querySelector('p').textContent = translatedView.specWifiDesc || specRows[2].querySelector('p').textContent;
    }
    if (specRows[3]) {
      specRows[3].querySelector('h4').textContent = translatedView.specEcoTitle || specRows[3].querySelector('h4').textContent;
      specRows[3].querySelector('p').textContent = translatedView.specEcoDesc || specRows[3].querySelector('p').textContent;
    }
    const choiceCards = document.querySelectorAll('.frame-choice-card');
    if (choiceCards[0]) {
      choiceCards[0].querySelector('h3').textContent = translatedView.frameChoicePortableTitle || choiceCards[0].querySelector('h3').textContent;
      choiceCards[0].querySelector('p').textContent = translatedView.frameChoicePortableDesc || choiceCards[0].querySelector('p').textContent;
      choiceCards[0].querySelector('.frame-choice-meta').textContent = translatedView.frameChoicePortableMeta || choiceCards[0].querySelector('.frame-choice-meta').textContent;
    }
    if (choiceCards[1]) {
      choiceCards[1].querySelector('.frame-choice-badge').textContent = translatedView.frameChoiceAvailable || choiceCards[1].querySelector('.frame-choice-badge').textContent;
      choiceCards[1].querySelector('h3').textContent = translatedView.frameChoiceLargeTitle || choiceCards[1].querySelector('h3').textContent;
      choiceCards[1].querySelector('p').textContent = translatedView.frameChoiceLargeDesc || choiceCards[1].querySelector('p').textContent;
      choiceCards[1].querySelector('.frame-choice-meta').textContent = translatedView.frameChoiceLargeMeta || choiceCards[1].querySelector('.frame-choice-meta').textContent;
    }
  }

  function renderFooter(data, links, socials, lang, pageMap, translatedView) {
    const footerText = document.querySelector('.footer-brand p');
    if (footerText && data.footerText) footerText.textContent = data.footerText;
    const copyright = document.querySelector('.footer-copyright');
    if (copyright && data.copyrightText) copyright.textContent = data.copyrightText;
    const groups = groupBy(links, 'group_name');
    const columns = document.querySelectorAll('.footer-links');
    const groupNames = [
      translatedView.footerGroupProduct || 'Product',
      translatedView.footerGroupSupport || 'Support',
      translatedView.footerGroupCompany || 'Company'
    ];
    const sourceGroups = ['Product', 'Support', 'Company'];
    columns.forEach((col, index) => {
      const name = groupNames[index];
      const sourceName = sourceGroups[index];
      const list = col.querySelector('ul');
      const title = col.querySelector('h4');
      if (title) title.textContent = name;
      if (list && groups[sourceName]?.length) {
        list.innerHTML = groups[sourceName].map((link) => `<li><a href="${localizedPageUrl(link.url, lang)}">${esc(localizedLinkLabel(link, pageMap, translatedView))}</a></li>`).join('');
      }
    });
    const socialRoot = document.querySelector('.footer-social');
    if (socialRoot && socials.length) socialRoot.innerHTML = socials.map((item) => item.icon === 'x-social' ? `<a href="${esc(item.url)}" class="x-social" aria-label="X">X</a>` : `<a href="${esc(item.url)}" aria-label="${esc(item.icon)}"><i class="${esc(item.icon)}"></i></a>`).join('');
  }

  function resolveLanguage(activeLanguages, recommended) {
    const pathLang = location.pathname.split('/').filter(Boolean)[0];
    const codes = activeLanguages.map((lang) => lang.code);
    if (codes.includes(pathLang)) return pathLang;
    const saved = localStorage.getItem('myframeLang');
    if (codes.includes(saved)) return saved;
    if (codes.includes(recommended)) return recommended;
    return 'en';
  }

  function resolveCurrency(currencies, recommended, lang) {
    const codes = currencies.map((item) => String(item.name || '').toUpperCase());
    const langCurrency = currencyForLanguage(lang);
    if (codes.includes(langCurrency)) return langCurrency;
    if (codes.includes(String(recommended || '').toUpperCase())) return String(recommended).toUpperCase();
    const saved = localStorage.getItem('myframeCurrency');
    if (codes.includes(saved)) return saved;
    return 'USD';
  }

  function localizedPageUrl(url, lang) {
    if (url.startsWith('#')) return url;
    if (url.startsWith('http')) return url;
    if (url === 'blog') return lang === 'en' ? '/blog' : `/${lang}/blog`;
    if (url.endsWith('.html')) return localizeMenuUrl(url, lang);
    const clean = url.replace(/^\/+/, '');
    return lang === 'en' ? `/page/${clean}` : `/${lang}/page/${clean}`;
  }

  function localizeMenuUrl(url, lang) {
    if (/^\/?(cart-checkout\.html)?(\?add=.*)?$/.test(url) || /cart-checkout\.html/.test(url)) {
      const add = url.includes('?') ? url.slice(url.indexOf('?')) : '';
      return lang === 'en' ? `/cart-checkout.html${add}` : `/${lang}/cart${add}`;
    }
    return url;
  }

  function translateMenuLabel(item) {
    if (/cart/i.test(item.label) || /cart-checkout/.test(item.url)) return view.menuCart || item.label;
    if (item.url === '#features') return view.menuFeatures || item.label;
    if (item.url === '#product') return view.menuProduct || item.label;
    if (item.url === '#pricing') return view.menuPricing || item.label;
    if (item.url === '#family') return view.menuFamilies || item.label;
    return item.label;
  }

  function localizedLinkLabel(link, pageMap, translatedView) {
    const key = String(link.url || '');
    if (key === '#features') return translatedView.menuFeatures || link.name;
    if (key === '#pricing') return translatedView.menuPricing || link.name;
    if (key === '#family') return translatedView.menuFamilies || link.name;
    if (key === 'download-app') return pageMap[key]?.title || translatedView.footerDownloadApp || link.name;
    const page = pageMap[key];
    return page?.title || link.name;
  }

  function localizeStaticLinks(lang) {
    document.querySelectorAll('a[href="/cart-checkout.html"], a[href="cart-checkout.html"], a[href="/cart-checkout.html?add=YX-133P"], a[href="cart-checkout.html?add=YX-133P"]').forEach((anchor) => {
      anchor.href = localizeMenuUrl(anchor.getAttribute('href') || '', lang);
    });
  }

  function formatPrice(baseUsd, currencyCode, currencies) {
    const row = currencies.find((item) => String(item.name || '').toUpperCase() === String(currencyCode || '').toUpperCase());
    const factor = row ? Number(row.value || 1) : 1;
    const sign = row?.sign || currencyCode || 'USD';
    const converted = baseUsd * factor;
    return `${sign === '$' ? '$' : `${sign} `}${converted.toFixed(currencyCode === 'USD' ? 0 : 2)}`;
  }

  function currencyForLanguage(lang) {
    if (lang === 'zh') return 'CNY';
    if (['fr', 'de', 'es'].includes(lang)) return 'EUR';
    return 'USD';
  }

  function updateCartBadge() {
    const badge = document.getElementById('navCartBadge');
    if (!badge) return;
    const cart = JSON.parse(localStorage.getItem('frampCart') || '{}');
    const count = Object.values(cart).reduce((sum, qty) => sum + qty, 0);
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
  }

  function translateBadge(value) {
    const lower = String(value || '').toLowerCase();
    if (lower.includes('available')) return view.badgeAvailableNow || value;
    if (lower.includes('coming')) return view.badgeComingSoon || value;
    if (lower.includes('under development')) return view.badgeUnderDevelopment || value;
    return value;
  }

  function openVideo(url) {
    if (!url) return;
    const modal = document.getElementById('videoModal');
    const root = document.getElementById('videoEmbedRoot');
    const closeBtn = document.getElementById('videoCloseBtn');
    if (!modal || !root) return window.open(url, '_blank', 'noopener,noreferrer');
    root.innerHTML = videoEmbedMarkup(url);
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    const close = () => {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      root.innerHTML = '';
    };
    closeBtn.onclick = close;
    modal.onclick = (event) => { if (event.target === modal) close(); };
  }

  const notifyState = { sku: '', productName: '' };
  const notifyModal = document.getElementById('notifyModal');
  const notifyTitle = document.getElementById('notifyProductTitle');
  const notifyForm = document.getElementById('notifyForm');
  const notifySuccess = document.getElementById('notifySuccess');
  const notifyError = document.getElementById('notifyError');
  const notifyClose = document.getElementById('notifyCloseBtn');

  window.openNotifyModal = function openNotifyModal(sku, productName) {
    if (!notifyModal || !notifyForm) return;
    notifyState.sku = sku || '';
    notifyState.productName = productName || '';
    if (notifyTitle) notifyTitle.textContent = productName || 'this product';
    notifyForm.reset();
    if (notifySuccess) notifySuccess.style.display = 'none';
    if (notifyError) notifyError.style.display = 'none';
    notifyModal.classList.add('open');
    notifyModal.setAttribute('aria-hidden', 'false');
  };

  function closeNotifyModal() {
    if (!notifyModal) return;
    notifyModal.classList.remove('open');
    notifyModal.setAttribute('aria-hidden', 'true');
  }

  if (notifyClose) notifyClose.onclick = closeNotifyModal;
  if (notifyModal) {
    notifyModal.onclick = (event) => { if (event.target === notifyModal) closeNotifyModal(); };
  }

  if (notifyForm) {
    notifyForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (notifySuccess) notifySuccess.style.display = 'none';
      if (notifyError) notifyError.style.display = 'none';
      const form = new FormData(notifyForm);
      try {
        const response = await fetch('/api/public/subscribers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            name: String(form.get('name') || '').trim(),
            email: String(form.get('email') || '').trim(),
            sku: notifyState.sku,
            language: currentLang
          })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Could not save your request.');
        if (notifySuccess) {
          notifySuccess.textContent = translated.notifyMeSuccess || 'Successful. We will notify you.';
          notifySuccess.style.display = 'block';
        }
        notifyForm.reset();
        setTimeout(closeNotifyModal, 1200);
      } catch (error) {
        if (notifyError) {
          notifyError.textContent = error.message;
          notifyError.style.display = 'block';
        }
      }
    });
  }

  function videoEmbedMarkup(url) {
    const direct = directVideoUrl(url);
    if (direct) {
      return `<video src="${esc(direct)}" controls autoplay playsinline style="width:100%;height:100%;background:#000;"></video>`;
    }
    return `<iframe src="${esc(videoEmbedUrl(url))}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
  }

  function directVideoUrl(url) {
    try {
      const parsed = new URL(url);
      return /\.(mp4|webm|ogg)(\?.*)?$/i.test(parsed.pathname + parsed.search) ? url : '';
    } catch (_) {
      return '';
    }
  }

  function videoEmbedUrl(url) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('youtube.com')) {
        const id = parsed.searchParams.get('v');
        if (id) return `https://www.youtube.com/embed/${id}`;
        if (parsed.pathname.startsWith('/shorts/')) return `https://www.youtube.com/embed/${parsed.pathname.split('/')[2] || ''}`;
        if (parsed.pathname.startsWith('/embed/')) return url;
      }
      if (parsed.hostname.includes('youtu.be')) return `https://www.youtube.com/embed/${parsed.pathname.replace('/', '')}`;
      if (parsed.hostname.includes('vimeo.com')) {
        const id = parsed.pathname.split('/').filter(Boolean).pop();
        if (id) return `https://player.vimeo.com/video/${id}`;
      }
      return url;
    } catch (_) {
      return url;
    }
  }

  function injectHreflang(activeLanguages) {
    document.querySelectorAll('link[rel="alternate"][hreflang]').forEach((item) => item.remove());
    const base = `${location.origin}/`;
    activeLanguages.forEach((item) => {
      const link = document.createElement('link');
      link.rel = 'alternate';
      link.hreflang = item.code;
      link.href = item.code === 'en' ? base : `${base}${item.code}`;
      document.head.appendChild(link);
    });
    const fallback = document.createElement('link');
    fallback.rel = 'alternate';
    fallback.hreflang = 'x-default';
    fallback.href = base;
    document.head.appendChild(fallback);
  }

  function groupBy(items, key) {
    return items.reduce((acc, item) => {
      const group = item[key] || 'Product';
      acc[group] = acc[group] || [];
      acc[group].push(item);
      return acc;
    }, {});
  }

  function toArray(value) {
    if (Array.isArray(value)) return value;
    try { return JSON.parse(value || '[]'); } catch (_) { return []; }
  }

  function shadeColor(color, percent) {
    const num = parseInt(String(color).replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const r = Math.max(0, Math.min(255, (num >> 16) + amt));
    const g = Math.max(0, Math.min(255, (num >> 8 & 0x00FF) + amt));
    const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
    return `#${(0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1)}`;
  }

})();
