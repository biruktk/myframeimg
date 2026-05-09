/* Hero carousel + nav cart badge + mobile menu (loaded after marketing HTML mounts). */
(function initHeroCarousel() {
  var slides = Array.from(document.querySelectorAll(".hero-slide"));
  var shell = document.querySelector(".hero-shell");
  var prev = document.querySelector("[data-hero-prev]");
  var next = document.querySelector("[data-hero-next]");
  if (!slides.length) return;
  var activeIndex = 0;
  var timer = null;
  function showSlide(index) {
    activeIndex = (index + slides.length) % slides.length;
    slides.forEach(function (slide, i) {
      slide.classList.toggle("is-active", i === activeIndex);
    });
    if (shell) shell.dataset.activeSlide = String(activeIndex);
    if (prev) prev.classList.toggle("is-hidden", activeIndex === 0);
  }
  function restartTimer() {
    window.clearInterval(timer);
    timer = window.setInterval(function () {
      showSlide(activeIndex + 1);
    }, 3000);
  }
  if (prev) prev.addEventListener("click", function () {
    showSlide(activeIndex - 1);
    restartTimer();
  });
  if (next) next.addEventListener("click", function () {
    showSlide(activeIndex + 1);
    restartTimer();
  });
  showSlide(0);
  restartTimer();
})();

function updateWebsiteNavCartBadge() {
  var badge = document.getElementById("navCartBadge");
  if (!badge) return;
  var cart = JSON.parse(localStorage.getItem("frampCart") || "{}");
  var count = Object.values(cart).reduce(function (sum, qty) {
    return sum + qty;
  }, 0);
  badge.textContent = String(count);
  badge.style.display = count > 0 ? "inline-flex" : "none";
}
updateWebsiteNavCartBadge();

(function initMobileMenu() {
  var toggle = document.getElementById("mobileMenuToggle");
  var menu = document.getElementById("mobileMenu");
  if (!toggle || !menu) return;
  function close() {
    menu.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  }
  toggle.addEventListener("click", function () {
    var open = !menu.classList.contains("open");
    menu.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
  });
  menu.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", close);
  });
  window.addEventListener("resize", function () {
    if (window.innerWidth > 1120) close();
  });
})();

window.addEventListener("storage", function (event) {
  if (event.key === "frampCart") updateWebsiteNavCartBadge();
});
