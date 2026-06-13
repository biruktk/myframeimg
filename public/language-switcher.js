/**
 * Custom language dropdown for static marketing pages (home, checkout).
 * Replaces native <select class="nav-lang"> with a slide-down panel.
 */
(function (global) {
  var FLAGS = { en: "🇺🇸", zh: "🇨🇳", es: "🇪🇸", fr: "🇫🇷", de: "🇩🇪", ja: "🇯🇵" };

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function labelFor(lang) {
    return lang.native_name || lang.name || lang.code;
  }

  function closeAll(except) {
    document.querySelectorAll(".lang-switcher.open").forEach(function (node) {
      if (node !== except) {
        node.classList.remove("open");
        var btn = node.querySelector(".lang-switcher-btn");
        if (btn) btn.setAttribute("aria-expanded", "false");
      }
    });
  }

  function mountLanguageSwitcher(mount, languages, currentCode, onSelect) {
    if (!mount || !languages.length) return;
    var current =
      languages.find(function (l) {
        return l.code === currentCode;
      }) || languages[0];

    mount.className = "lang-switcher";
    mount.innerHTML =
      '<button type="button" class="lang-switcher-btn" aria-haspopup="listbox" aria-expanded="false">' +
      '<span class="lang-switcher-flag">' +
      esc(FLAGS[current.code] || "🌐") +
      "</span>" +
      '<span class="lang-switcher-label">' +
      esc(labelFor(current)) +
      "</span>" +
      '<i class="fas fa-chevron-down lang-switcher-chevron" aria-hidden="true"></i>' +
      "</button>" +
      '<div class="lang-switcher-panel" role="listbox" aria-label="Language">' +
      languages
        .map(function (lang) {
          var selected = lang.code === current.code;
          return (
            '<button type="button" class="lang-switcher-option' +
            (selected ? " is-selected" : "") +
            '" role="option" data-code="' +
            esc(lang.code) +
            '" aria-selected="' +
            (selected ? "true" : "false") +
            '">' +
            '<span class="lang-switcher-option-flag">' +
            esc(FLAGS[lang.code] || "🌐") +
            "</span>" +
            '<span class="lang-switcher-option-text">' +
            '<strong>' +
            esc(labelFor(lang)) +
            "</strong>" +
            (lang.name && lang.name !== labelFor(lang)
              ? '<small>' + esc(lang.name) + "</small>"
              : "") +
            "</span>" +
            (selected ? '<i class="fas fa-check lang-switcher-check" aria-hidden="true"></i>' : "") +
            "</button>"
          );
        })
        .join("") +
      "</div>";

    var btn = mount.querySelector(".lang-switcher-btn");
    var panel = mount.querySelector(".lang-switcher-panel");

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = mount.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(open));
      if (open) closeAll(mount);
    });

    panel.querySelectorAll(".lang-switcher-option").forEach(function (option) {
      option.addEventListener("click", function (e) {
        e.stopPropagation();
        var code = option.getAttribute("data-code");
        mount.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
        if (code && code !== currentCode && typeof onSelect === "function") onSelect(code);
      });
    });
  }

  if (!global.__myframeLangSwitcherBound) {
    global.__myframeLangSwitcherBound = true;
    document.addEventListener("click", function () {
      closeAll(null);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeAll(null);
    });
  }

  global.mountLanguageSwitcher = mountLanguageSwitcher;
})(window);
