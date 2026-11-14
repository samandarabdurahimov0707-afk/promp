/* ==========================================================================
   Prompt injenering kursi — umumiy sahifa logikasi
   --------------------------------------------------------------------------
   Barcha sahifalarda ishlatiladi: yil, mobil menyu, narx, Telegram havolasi
   va service worker (PWA). Video/to'lov logikasi js/app.js ichida.
   ========================================================================== */

(function () {
  "use strict";

  var CONFIG = window.PAYWALL_CONFIG || {};
  var API_BASE = CONFIG.apiBase || "/api";

  /* ------------------------------- Yil ---------------------------------- */

  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ---------------------------- Mobil menyu ------------------------------ */

  var navToggle = document.getElementById("nav-toggle");
  var navMenu = document.getElementById("nav-menu");

  function closeNav() {
    if (!navMenu || !navToggle) return;
    navMenu.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "Menyuni ochish");
  }

  function openNav() {
    if (!navMenu || !navToggle) return;
    navMenu.classList.add("is-open");
    navToggle.setAttribute("aria-expanded", "true");
    navToggle.setAttribute("aria-label", "Menyuni yopish");
  }

  if (navToggle && navMenu) {
    navToggle.addEventListener("click", function () {
      if (navMenu.classList.contains("is-open")) closeNav();
      else openNav();
    });

    navMenu.addEventListener("click", function (event) {
      if (event.target.closest("a")) closeNav();
    });

    document.addEventListener("click", function (event) {
      if (!navMenu.classList.contains("is-open")) return;
      if (navMenu.contains(event.target) || navToggle.contains(event.target)) {
        return;
      }
      closeNav();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeNav();
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 860) closeNav();
    });
  }

  /* ------------------------------- Narx --------------------------------- */

  function formatPrice(value) {
    var som = Math.round(Number(value || 0));

    try {
      return som.toLocaleString("ru-RU") + " so'm";
    } catch (error) {
      return som + " so'm";
    }
  }

  function telegramLink(value) {
    var text = String(value || "").trim();
    if (!text) return "";
    if (/^https?:\/\//i.test(text)) return text;

    return "https://t.me/" + text.replace(/^@/, "");
  }

  function applyConfig(data) {
    if (!data) return;

    if (data.price) {
      var priceText = formatPrice(data.price);
      var nodes = document.querySelectorAll("[data-price]");
      Array.prototype.forEach.call(nodes, function (node) {
        node.textContent = priceText;
      });
    }

    var link = telegramLink(data.telegram);
    var telegramNodes = document.querySelectorAll("[data-telegram]");

    Array.prototype.forEach.call(telegramNodes, function (node) {
      if (!link) {
        node.hidden = true;
        return;
      }

      node.href = link;
      node.hidden = false;
    });
  }

  var configPromise = fetch(API_BASE + "/config", {
    headers: { accept: "application/json" }
  })
    .then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    })
    .then(function (data) {
      applyConfig(data);
      return data;
    })
    .catch(function () {
      return null;
    });

  window.PK = {
    config: CONFIG,
    configPromise: configPromise,
    formatPrice: formatPrice,
    telegramLink: telegramLink
  };

  /* --------------------------- Service worker ---------------------------- */

  if (
    "serviceWorker" in navigator &&
    (location.protocol === "https:" ||
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1")
  ) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {
        /* PWA ixtiyoriy — xato bo'lsa sayt ishlashda davom etadi */
      });
    });
  }
})();
