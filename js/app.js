/* ==========================================================================
   Prompt injenering kursi — sayt logikasi
   --------------------------------------------------------------------------
   - <video> teglaridan yoki admin panelda saqlangan ro'yxatdan dars
     kartochkalarini yaratadi
   - qidiruv, filtrlar va o'quv jarayonini (progress) saqlaydi
   - Payme / karta orqali to'lov oynasini boshqaradi
   ========================================================================== */

(function () {
  "use strict";

  var grid = document.getElementById("video-grid");
  var searchInput = document.getElementById("search");
  var emptyState = document.getElementById("empty");
  var statCount = document.getElementById("stat-count");
  var statFree = document.getElementById("stat-free");
  var statPrice = document.getElementById("stat-price");
  var resultCount = document.getElementById("result-count");
  var filterButtons = document.querySelectorAll("[data-filter]");

  var heroProgressText = document.getElementById("hero-progress-text");
  var heroProgressBar = document.getElementById("hero-progress-bar");
  var heroProgressWrap = document.getElementById("hero-progress-wrap");
  var resumeButton = document.getElementById("resume-btn");

  var player = document.getElementById("player");
  var playerFrame = document.getElementById("player-frame");
  var playerTitle = document.getElementById("player-title");
  var playerDesc = document.getElementById("player-desc");
  var playerClose = document.getElementById("player-close");
  var playerDone = document.getElementById("player-done");

  var paywall = document.getElementById("paywall");
  var paywallClose = document.getElementById("paywall-close");
  var paywallPrice = document.getElementById("paywall-price");
  var paywallAmount = document.getElementById("paywall-amount");
  var paywallCard = document.getElementById("paywall-card");
  var paywallHolder = document.getElementById("paywall-holder");
  var paywallCopy = document.getElementById("paywall-copy");
  var paywallCode = document.getElementById("paywall-code");
  var paywallTelegram = document.getElementById("paywall-telegram");
  var paywallCheck = document.getElementById("paywall-check");
  var paywallStatus = document.getElementById("paywall-status");
  var paywallPayme = document.getElementById("paywall-payme");
  var paywallAutoNote = document.getElementById("paywall-auto-note");
  var paywallOr = document.getElementById("paywall-or");
  var paywallManual = document.getElementById("paywall-manual");
  var toastEl = document.getElementById("toast");

  var accountButton = document.getElementById("account-btn");
  var auth = document.getElementById("auth");
  var authClose = document.getElementById("auth-close");
  var authTitle = document.getElementById("auth-title");
  var authLead = document.getElementById("auth-lead");
  var authTabs = document.getElementById("auth-tabs");
  var authStatus = document.getElementById("auth-status");
  var authAccount = document.getElementById("auth-account");
  var authName = document.getElementById("auth-name");
  var authEmail = document.getElementById("auth-email");
  var authAvatar = document.getElementById("auth-avatar");
  var authPaid = document.getElementById("auth-paid");
  var authLogout = document.getElementById("auth-logout");
  var loginForm = document.getElementById("auth-login-form");
  var registerForm = document.getElementById("auth-register-form");
  var loginEmail = document.getElementById("auth-login-email");
  var loginPassword = document.getElementById("auth-login-password");
  var loginSubmit = document.getElementById("auth-login-submit");
  var registerName = document.getElementById("auth-register-name");
  var registerEmail = document.getElementById("auth-register-email");
  var registerPassword = document.getElementById("auth-register-password");
  var registerSubmit = document.getElementById("auth-register-submit");

  var PAYWALL = window.PAYWALL_CONFIG || {};
  var UID_KEY = "pk_uid";
  var PROGRESS_KEY = "pk_progress";
  var LAST_KEY = "pk_last_lesson";
  var FILTER_KEY = "pk_filter";

  var uid = getUid();
  var hasAccess = false;
  var accessPromise = null;
  var orderPromise = null;
  var orderCode = "";
  var paywallTimer = null;
  var toastTimer = null;
  var lastFocusedPaywall = null;
  var lastFocusedAuth = null;
  var lastFocused = null;
  var activeVideo = null;

  var account = null;
  var accountPromise = null;
  var pendingAfterAuth = null;
  var authMode = "login";
  var authBusy = false;

  var VIDEO_LIST = readVideoTags();
  var videosPromise = null;
  var progress = loadProgress();
  var lastLessonKey = loadLastLesson();
  var currentFilter = loadFilter();

  var PLAY_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

  var LOCK_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a5 5 0 0 0-5 5v2H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 7V7a3 3 0 1 1 6 0v2H9Z"/></svg>';

  /* ----------------------------- Yordamchilar ---------------------------- */

  function lessonNumber(title) {
    var match = String(title || "").match(/(\d+)\s*[-\u2013.]?\s*dars/i);
    if (match) return Number(match[1]);

    match = String(title || "").match(/^\s*(\d+)\s*[.)-]/);
    return match ? Number(match[1]) : 0;
  }

  function readVideoTags() {
    var container = document.getElementById("video-tags");
    if (!container) return [];

    var paidFrom = Number(container.getAttribute("data-paid-from")) || 0;

    return Array.prototype.slice
      .call(container.querySelectorAll("video"))
      .map(function (el, i) {
        var youtube = el.getAttribute("data-youtube") || "";
        var bunny = el.getAttribute("data-bunny") || "";
        var src = el.getAttribute("src") || "";
        var free = el.getAttribute("data-free") === "true";
        var number = i + 1;
        var title =
          el.getAttribute("data-title") ||
          el.getAttribute("title") ||
          "Nomsiz dars";
        var lesson = lessonNumber(title);

        var sources = Array.prototype.slice
          .call(el.querySelectorAll("source"))
          .map(function (source) {
            return {
              src: source.getAttribute("src") || "",
              type: source.getAttribute("type") || ""
            };
          })
          .filter(function (source) {
            return Boolean(source.src);
          });

        if (!src && sources.length) src = sources[0].src;

        return {
          number: number,
          title: title,
          description: el.getAttribute("data-description") || "",
          duration: el.getAttribute("data-duration") || "",
          poster: el.getAttribute("poster") || "",
          type: bunny ? "bunny" : youtube ? "youtube" : "file",
          src: youtube || src,
          sources: sources,
          bunny: bunny,
          paid:
            !free &&
            (el.getAttribute("data-paid") === "true" ||
              (paidFrom > 0 &&
                (lesson > 0 ? lesson >= paidFrom : number >= paidFrom)))
        };
      });
  }

  /*
   * Admin panelda saqlangan darsni sayt ichidagi ko'rinishga keltiradi.
   * `source: "upload"` — fayl Blobs'da, oqim `/api/video` orqali keladi.
   */
  function normalizeStoredVideo(video, index) {
    var source =
      video.source === "upload"
        ? "upload"
        : video.source === "youtube"
          ? "youtube"
          : "url";
    var src =
      source === "upload"
        ? apiUrl("/video") + "?id=" + encodeURIComponent(video.id)
        : String(video.src || "");

    return {
      id: String(video.id || ""),
      number: index + 1,
      title: String(video.title || "Nomsiz dars"),
      description: String(video.description || ""),
      duration: String(video.duration || ""),
      poster: String(video.poster || ""),
      paid: Boolean(video.paid),
      type: source === "youtube" ? "youtube" : "file",
      src: src,
      sources: [],
      bunny: "",
      storage: source === "upload" ? "blob" : "url",
      mime: String(video.mime || "")
    };
  }

  function parseYouTubeId(src) {
    if (!src) return null;

    var value = String(src).trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;

    try {
      var url = new URL(value);

      if (url.hostname === "youtu.be") {
        return url.pathname.slice(1).split("/")[0] || null;
      }

      if (
        url.pathname.indexOf("/embed/") === 0 ||
        url.pathname.indexOf("/shorts/") === 0 ||
        url.pathname.indexOf("/live/") === 0
      ) {
        return url.pathname.split("/")[2] || null;
      }

      return url.searchParams.get("v");
    } catch (error) {
      return null;
    }
  }

  function hasSources(video) {
    return Array.isArray(video.sources) && video.sources.length > 0;
  }

  function isPlayable(video) {
    if (video.type === "bunny") return Boolean(video.bunny);
    if (video.type === "youtube") return Boolean(parseYouTubeId(video.src));
    return Boolean(video.src) || hasSources(video);
  }

  function thumbnailFor(video) {
    if (video.poster) return video.poster;

    if (video.type === "youtube") {
      var id = parseYouTubeId(video.src);
      if (id) return "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg";
    }

    return "";
  }

  function formatPrice(value) {
    if (window.PK && typeof window.PK.formatPrice === "function") {
      return window.PK.formatPrice(value);
    }

    var som = Math.round(Number(value || 0));

    try {
      return som.toLocaleString("ru-RU") + " so'm";
    } catch (error) {
      return som + " so'm";
    }
  }

  function formatCard(value) {
    return String(value || "")
      .replace(/\D/g, "")
      .replace(/(\d{4})(?=\d)/g, "$1 ");
  }

  function telegramLink() {
    if (window.PK && typeof window.PK.telegramLink === "function") {
      return window.PK.telegramLink(PAYWALL.telegram);
    }

    var value = String(PAYWALL.telegram || "").trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;

    return "https://t.me/" + value.replace(/^@/, "");
  }

  function getUid() {
    try {
      var saved = localStorage.getItem(UID_KEY);
      if (saved) return saved;

      var generated =
        window.crypto && typeof window.crypto.randomUUID === "function"
          ? window.crypto.randomUUID()
          : "u" +
            Date.now().toString(36) +
            Math.random().toString(36).slice(2, 10);

      localStorage.setItem(UID_KEY, generated);
      return generated;
    } catch (error) {
      return (
        "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
      );
    }
  }

  function apiUrl(path) {
    return (PAYWALL.apiBase || "/api") + path;
  }

  function apiRequest(path, options) {
    var opts = options || {};

    return fetch(apiUrl(path), {
      method: opts.method || "GET",
      headers: Object.assign(
        { accept: "application/json" },
        opts.headers || {}
      ),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store"
    }).then(function (response) {
      return response
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          return {
            ok: response.ok,
            status: response.status,
            data: data || {}
          };
        });
    });
  }

  function currentUid() {
    return account && account.id ? account.id : uid;
  }

  /* ------------------------------- Hisob --------------------------------- */

  function setAuthStatus(message, isError) {
    if (!authStatus) return;

    authStatus.textContent = message || "";
    authStatus.classList.toggle("is-error", Boolean(isError));
  }

  function updateScrollLock() {
    var open =
      (player && !player.hidden) ||
      (paywall && !paywall.hidden) ||
      (auth && !auth.hidden);

    document.body.classList.toggle("no-scroll", Boolean(open));
  }

  function updateAccountButton() {
    if (!accountButton) return;

    accountButton.textContent = account
      ? account.name || "Hisobim"
      : "Kirish";
    accountButton.classList.toggle("is-account", Boolean(account));
    accountButton.classList.toggle("is-paid", Boolean(account && hasAccess));
    accountButton.setAttribute(
      "aria-label",
      account ? "Hisob: " + (account.name || account.email) : "Hisobga kirish"
    );
  }

  function renderAuthState() {
    var loggedIn = Boolean(account);

    if (authTitle) {
      authTitle.textContent = loggedIn
        ? "Sizning hisobingiz"
        : authMode === "register"
          ? "Ro'yxatdan o'tish"
          : "Hisobingizga kiring";
    }

    if (authLead) {
      authLead.textContent = loggedIn
        ? "To'lov holati va darslarga kirish shu hisobga bog'langan."
        : "Pullik darslarni ochish uchun hisob kerak. Bepul darslar hisobsiz ham ochiq.";
    }

    if (authTabs) authTabs.hidden = loggedIn;
    if (loginForm) loginForm.hidden = loggedIn || authMode !== "login";
    if (registerForm) registerForm.hidden = loggedIn || authMode !== "register";
    if (authAccount) authAccount.hidden = !loggedIn;

    Array.prototype.forEach.call(
      document.querySelectorAll("[data-auth-tab]"),
      function (tab) {
        var active = tab.getAttribute("data-auth-tab") === authMode;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", active ? "true" : "false");
      }
    );

    if (loggedIn) {
      if (authName) authName.textContent = account.name || "Foydalanuvchi";
      if (authEmail) authEmail.textContent = account.email || "";
      if (authAvatar) {
        authAvatar.textContent =
          String(account.name || "?").trim().charAt(0).toUpperCase() || "?";
      }

      if (authPaid) {
        authPaid.textContent = hasAccess
          ? "To'liq kurs ochiq ✓"
          : "Hozircha bepul darslar ochiq";
        authPaid.classList.toggle("is-paid", Boolean(hasAccess));
      }
    }

    updateAccountButton();
  }

  function setAuthMode(mode) {
    if (mode !== "register") mode = "login";
    if (account) {
      authMode = "login";
      renderAuthState();
      return;
    }

    authMode = mode;
    setAuthStatus("");
    renderAuthState();

    var input = mode === "register" ? registerName : loginEmail;
    if (input) {
      setTimeout(function () {
        input.focus();
      }, 0);
    }
  }

  function openAuth(mode, after) {
    if (!auth) return;

    pendingAfterAuth = after || null;
    lastFocusedAuth = document.activeElement;
    auth.hidden = false;
    updateScrollLock();

    authMode = account ? "login" : mode === "register" ? "register" : "login";
    setAuthStatus("");
    renderAuthState();

    if (authClose) authClose.focus();

    if (!account) {
      var input = authMode === "register" ? registerName : loginEmail;
      if (input) input.focus();
    }
  }

  function closeAuth() {
    if (!auth || auth.hidden) return;

    pendingAfterAuth = null;
    auth.hidden = true;
    updateScrollLock();

    if (lastFocusedAuth && typeof lastFocusedAuth.focus === "function") {
      lastFocusedAuth.focus();
    }
  }

  function loadAccount() {
    if (accountPromise) return accountPromise;

    accountPromise = apiRequest("/auth")
      .then(function (result) {
        if (result.ok && result.data.user) {
          account = result.data.user;
          if (result.data.paid) hasAccess = true;
        }

        renderAuthState();
        return account;
      })
      .catch(function () {
        renderAuthState();
        return null;
      })
      .then(function (value) {
        accountPromise = null;
        return value;
      });

    return accountPromise;
  }

  function finishAuth() {
    var pending = pendingAfterAuth;
    pendingAfterAuth = null;

    renderAuthState();
    render();
    updatePaywall();

    if (!pending) return;

    closeAuth();

    if (pending.type === "player" && pending.video) {
      openPlayer(pending.video);
      return;
    }

    if (pending.type === "paywall") {
      openPaywall();
    }
  }

  function submitAuth(mode) {
    if (authBusy) return;

    var isRegister = mode === "register";
    var name = registerName ? registerName.value.trim() : "";
    var emailInput = isRegister ? registerEmail : loginEmail;
    var passwordInput = isRegister ? registerPassword : loginPassword;
    var email = emailInput ? emailInput.value.trim() : "";
    var password = passwordInput ? passwordInput.value : "";

    if (isRegister && name.length < 2) {
      setAuthStatus("Ism kamida 2 ta belgidan iborat bo'lishi kerak.", true);
      if (registerName) registerName.focus();
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setAuthStatus("Email manzil noto'g'ri.", true);
      return;
    }

    if (!password) {
      setAuthStatus("Parolni kiriting.", true);
      return;
    }

    if (isRegister && password.length < 8) {
      setAuthStatus("Parol kamida 8 ta belgidan iborat bo'lishi kerak.", true);
      return;
    }

    authBusy = true;
    var button = isRegister ? registerSubmit : loginSubmit;
    if (button) button.disabled = true;

    setAuthStatus(isRegister ? "Hisob yaratilmoqda..." : "Kirilmoqda...");

    apiRequest("/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: {
        action: isRegister ? "register" : "login",
        name: name,
        email: email,
        password: password,
        guestUid: uid
      }
    })
      .then(function (result) {
        if (!result.ok || !result.data.user) {
          setAuthStatus(
            result.data.error || "Xatolik yuz berdi. Qayta urinib ko'ring.",
            true
          );
          return;
        }

        account = result.data.user;
        hasAccess = Boolean(result.data.paid);
        accessPromise = null;

        if (loginPassword) loginPassword.value = "";
        if (registerPassword) registerPassword.value = "";

        setAuthStatus("");
        showToast(
          isRegister ? "Hisob yaratildi ✓" : "Hisobingizga kirdingiz ✓"
        );

        return checkAccess().then(function () {
          finishAuth();
        });
      })
      .catch(function () {
        setAuthStatus(
          "Serverga ulanib bo'lmadi. Internetni tekshiring.",
          true
        );
      })
      .then(function () {
        authBusy = false;
        if (button) button.disabled = false;
      });
  }

  function logoutAccount() {
    if (authBusy) return;

    authBusy = true;
    setAuthStatus("Chiqilmoqda...");

    apiRequest("/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: { action: "logout" }
    })
      .then(function () {
        account = null;
        hasAccess = false;
        accessPromise = null;
        authMode = "login";

        setAuthStatus("Tizimdan chiqdingiz.");
        showToast("Tizimdan chiqdingiz");

        return checkAccess().then(function (granted) {
          hasAccess = granted;
          render();
          updatePaywall();
          renderAuthState();
        });
      })
      .catch(function () {
        setAuthStatus("Chiqib bo'lmadi. Qayta urinib ko'ring.", true);
      })
      .then(function () {
        authBusy = false;
      });
  }

  /* ---------------------------- O'quv jarayoni --------------------------- */

  function progressKey(video) {
    if (video && video.id) return "id:" + String(video.id);
    return String(video.number) + "|" + String(video.title || "");
  }

  function loadProgress() {
    try {
      var raw = localStorage.getItem(PROGRESS_KEY);
      var data = raw ? JSON.parse(raw) : {};
      return data && typeof data === "object" ? data : {};
    } catch (error) {
      return {};
    }
  }

  function saveProgress() {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    } catch (error) {
      /* localStorage to'lgan bo'lsa jim o'tamiz */
    }
  }

  function loadLastLesson() {
    try {
      return localStorage.getItem(LAST_KEY) || "";
    } catch (error) {
      return "";
    }
  }

  function saveLastLesson(video) {
    lastLessonKey = progressKey(video);

    try {
      localStorage.setItem(LAST_KEY, lastLessonKey);
    } catch (error) {
      /* e'tiborsiz */
    }
  }

  function loadFilter() {
    try {
      var value = localStorage.getItem(FILTER_KEY);
      return value === "free" || value === "paid" ? value : "all";
    } catch (error) {
      return "all";
    }
  }

  function saveFilter(value) {
    try {
      localStorage.setItem(FILTER_KEY, value);
    } catch (error) {
      /* e'tiborsiz */
    }
  }

  function progressFor(video) {
    var item = progress[progressKey(video)];
    var percent = item && Number(item.percent);

    return {
      percent: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0,
      done: Boolean(item && item.done)
    };
  }

  function setProgress(video, percent, done) {
    var key = progressKey(video);
    var previous = progress[key] || {};
    var value = Math.max(0, Math.min(100, Math.round(percent)));

    progress[key] = {
      percent: done ? 100 : Math.max(Number(previous.percent) || 0, value),
      done: Boolean(done || previous.done),
      updatedAt: Date.now()
    };

    saveProgress();
    updateProgressUI();
    updateCardProgress(video);
  }

  function toggleDone(video) {
    var current = progressFor(video);
    var key = progressKey(video);

    if (current.done) {
      progress[key] = {
        percent: 0,
        done: false,
        updatedAt: Date.now()
      };
    } else {
      progress[key] = {
        percent: 100,
        done: true,
        updatedAt: Date.now()
      };
    }

    saveProgress();
    updateProgressUI();
    updateCardProgress(video);
    updateDoneButton();

    if (!current.done) showToast("Dars tugallangan deb belgilandi ✓");
  }

  function completedCount() {
    return VIDEO_LIST.filter(function (video) {
      return progressFor(video).done;
    }).length;
  }

  function updateProgressUI() {
    var total = VIDEO_LIST.length;
    var done = completedCount();
    var percent = total > 0 ? Math.round((done / total) * 100) : 0;

    if (heroProgressText) {
      heroProgressText.textContent = done + " / " + total;
    }

    if (heroProgressBar) {
      heroProgressBar.style.width = percent + "%";
    }

    if (heroProgressWrap) {
      heroProgressWrap.setAttribute("aria-valuenow", String(percent));
    }
  }

  function updateCardProgress(video) {
    if (!grid) return;

    var key = progressKey(video);
    var cards = grid.querySelectorAll(".card");

    Array.prototype.forEach.call(cards, function (card) {
      if (card.getAttribute("data-progress-key") !== key) return;

      var bar = card.querySelector(".card__progress span");
      var value = progressFor(video);

      if (bar) {
        bar.style.width = value.done ? "100%" : value.percent + "%";
      }

      if (value.done) card.classList.add("card--done");
      else card.classList.remove("card--done");
    });
  }

  function updateDoneButton() {
    if (!playerDone || !activeVideo) return;

    var done = progressFor(activeVideo).done;

    playerDone.textContent = done
      ? "Tugallandi ✓"
      : "Tugallandi deb belgilash";
    playerDone.classList.toggle("is-done", done);
  }

  /* -------------------------------- Karta -------------------------------- */

  function createVideoElement(video) {
    var el = document.createElement("video");
    var saved = progressFor(video);
    var lastSavedAt = 0;

    el.controls = true;
    el.autoplay = true;
    el.playsInline = true;
    el.setAttribute("playsinline", "");

    if (video.poster) el.poster = video.poster;

    var sources = hasSources(video)
      ? video.sources
      : video.src
        ? [{ src: video.src }]
        : [];

    sources.forEach(function (item) {
      var source = document.createElement("source");
      var src = typeof item === "string" ? item : item && item.src;

      if (!src) return;

      source.src = src;
      if (item && item.type) source.type = item.type;
      el.appendChild(source);
    });

    el.addEventListener("loadedmetadata", function () {
      if (
        saved.percent > 3 &&
        saved.percent < 95 &&
        Number.isFinite(el.duration) &&
        el.duration > 0
      ) {
        try {
          el.currentTime = (el.duration * saved.percent) / 100;
        } catch (error) {
          /* ba'zi brauzerlar seek'ni rad etishi mumkin */
        }
      }
    });

    el.addEventListener("timeupdate", function () {
      if (!el.duration || !Number.isFinite(el.duration)) return;

      var now = Date.now();
      if (now - lastSavedAt < 4000) return;

      lastSavedAt = now;

      var percent = (el.currentTime / el.duration) * 100;
      setProgress(video, percent, percent >= 95);
    });

    el.addEventListener("pause", function () {
      if (!el.duration || !Number.isFinite(el.duration)) return;

      var percent = (el.currentTime / el.duration) * 100;
      setProgress(video, percent, percent >= 95);
    });

    el.addEventListener("ended", function () {
      setProgress(video, 100, true);
      updateDoneButton();
      showToast("Dars tugallandi ✓");
    });

    el.appendChild(
      document.createTextNode("Brauzeringiz videoni qo'llab-quvvatlamaydi.")
    );

    return el;
  }

  function createCard(video, index) {
    var playable = isPlayable(video);
    var locked = Boolean(video.paid) && !hasAccess;
    var number = video.number || index + 1;
    var saved = progressFor(video);
    var done = saved.done;

    var card = document.createElement("article");
    card.className =
      "card" +
      (playable || locked ? "" : " card--soon") +
      (locked ? " card--locked" : "") +
      (done ? " card--done" : "");
    card.setAttribute(
      "aria-label",
      (video.title || "Dars") + (locked ? " (pullik)" : "")
    );
    card.setAttribute("data-progress-key", progressKey(video));
    card.setAttribute("data-index", String(index));

    if (playable || locked) {
      card.tabIndex = 0;
      card.setAttribute("role", "button");

      card.addEventListener("click", function () {
        if (locked) openPaywall();
        else openPlayer(video);
      });

      card.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (locked) openPaywall();
          else openPlayer(video);
        }
      });
    }

    /* Muqova */
    var thumb = document.createElement("div");
    thumb.className = "card__thumb";
    thumb.style.setProperty("--hue", String((number * 47 + 258) % 360));

    var poster = thumbnailFor(video);
    if (poster) {
      var img = document.createElement("img");
      img.src = poster;
      img.alt = "";
      img.loading = "lazy";
      img.addEventListener("error", function () {
        img.remove();
        thumb.classList.add("card__thumb--fallback");
      });
      thumb.appendChild(img);
    } else {
      thumb.classList.add("card__thumb--fallback");
    }

    var num = document.createElement("span");
    num.className = "card__num";
    num.textContent = String(number).padStart(2, "0");
    thumb.appendChild(num);

    if (locked) {
      var lock = document.createElement("span");
      lock.className = "card__play card__play--lock";
      lock.innerHTML = LOCK_ICON;
      thumb.appendChild(lock);

      var paidBadge = document.createElement("span");
      paidBadge.className = "card__badge card__badge--paid";
      paidBadge.textContent = "Pullik";
      thumb.appendChild(paidBadge);
    } else if (done) {
      var doneBadge = document.createElement("span");
      doneBadge.className = "card__badge card__badge--done";
      doneBadge.textContent = "Tugallangan ✓";
      thumb.appendChild(doneBadge);

      if (playable) {
        var donePlay = document.createElement("span");
        donePlay.className = "card__play";
        donePlay.innerHTML = PLAY_ICON;
        thumb.appendChild(donePlay);
      }
    } else if (!playable) {
      var soon = document.createElement("span");
      soon.className = "card__badge";
      soon.textContent = "Tez kunda";
      thumb.appendChild(soon);
    } else {
      if (video.paid) {
        var owned = document.createElement("span");
        owned.className = "card__badge card__badge--owned";
        owned.textContent = "To'langan";
        thumb.appendChild(owned);
      } else {
        var free = document.createElement("span");
        free.className = "card__badge card__badge--free";
        free.textContent = "Bepul";
        thumb.appendChild(free);
      }

      var play = document.createElement("span");
      play.className = "card__play";
      play.innerHTML = PLAY_ICON;
      thumb.appendChild(play);
    }

    if (video.duration) {
      var duration = document.createElement("span");
      duration.className = "card__dur";
      duration.textContent = video.duration;
      thumb.appendChild(duration);
    }

    if (saved.percent > 0 && !saved.done) {
      var progressBar = document.createElement("span");
      progressBar.className = "card__progress";
      var progressFill = document.createElement("span");
      progressFill.style.width = saved.percent + "%";
      progressBar.appendChild(progressFill);
      thumb.appendChild(progressBar);
    }

    /* Matn qismi */
    var body = document.createElement("div");
    body.className = "card__body";

    var title = document.createElement("h3");
    title.className = "card__title";
    title.textContent = video.title || "Nomsiz dars";
    body.appendChild(title);

    if (video.description) {
      var desc = document.createElement("p");
      desc.className = "card__desc";
      desc.textContent = video.description;
      body.appendChild(desc);
    }

    var meta = document.createElement("span");
    meta.className = "card__meta";
    meta.textContent = locked
      ? "Pullik dars"
      : !playable
        ? "Tez kunda"
        : done
          ? "Tugallangan"
          : video.paid
            ? "To'langan"
            : "Bepul dars";
    body.appendChild(meta);

    card.appendChild(thumb);
    card.appendChild(body);

    return card;
  }

  /* ------------------------------ Ro'yxatni chizish ---------------------- */

  function render() {
    var query = (searchInput.value || "").trim().toLowerCase();

    var visible = VIDEO_LIST.filter(function (video) {
      if (currentFilter === "free" && video.paid) return false;
      if (currentFilter === "paid" && !video.paid) return false;
      if (!query) return true;

      var haystack = (video.title || "") + " " + (video.description || "");
      return haystack.toLowerCase().indexOf(query) !== -1;
    });

    grid.textContent = "";

    visible.forEach(function (video, index) {
      grid.appendChild(createCard(video, index));
    });

    emptyState.hidden = visible.length > 0;
    statCount.textContent = String(VIDEO_LIST.length);

    if (statFree) {
      statFree.textContent = String(
        VIDEO_LIST.filter(function (video) {
          return !video.paid;
        }).length
      );
    }

    if (statPrice) statPrice.textContent = formatPrice(PAYWALL.price);

    if (resultCount) {
      resultCount.textContent =
        visible.length +
        " ta dars" +
        (visible.length !== VIDEO_LIST.length ? " topildi" : "");
    }

    Array.prototype.forEach.call(filterButtons, function (button) {
      var active = button.getAttribute("data-filter") === currentFilter;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    updateProgressUI();
    updateBuyButtons();
  }

  function setFilter(value) {
    if (value !== "free" && value !== "paid" && value !== "all") return;

    currentFilter = value;
    saveFilter(value);
    render();
  }

  function updateBuyButtons() {
    var buttons = document.querySelectorAll("[data-buy]");

    Array.prototype.forEach.call(buttons, function (button) {
      if (!button.getAttribute("data-original")) {
        button.setAttribute("data-original", button.innerHTML);
      }

      if (hasAccess) {
        button.innerHTML = "Barcha darslar ochiq ✓";
        button.classList.add("is-done");
      } else {
        button.innerHTML = button.getAttribute("data-original");
        button.classList.remove("is-done");
      }
    });
  }

  /* -------------------------------- Pleyer ------------------------------- */

  function openPlayer(video) {
    if (video.paid && !account) {
      openAuth("register", { type: "player", video: video });
      return;
    }

    if (video.paid && !hasAccess) {
      openPaywall();
      return;
    }

    activeVideo = video;
    lastFocused = document.activeElement;

    saveLastLesson(video);

    playerTitle.textContent = video.title || "";
    playerDesc.textContent = video.description || "";
    playerDesc.hidden = !video.description;
    playerFrame.textContent = "";

    if (video.type === "bunny") {
      openBunnyPlayer(video);
    } else if (video.type === "youtube") {
      var id = parseYouTubeId(video.src);
      var iframe = document.createElement("iframe");
      iframe.src =
        "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&rel=0";
      iframe.title = video.title || "Video";
      iframe.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.allowFullscreen = true;
      playerFrame.appendChild(iframe);
    } else {
      playerFrame.appendChild(createVideoElement(video));
    }

    player.hidden = false;
    updateScrollLock();
    updateDoneButton();
    playerClose.focus();
  }

  function openBunnyPlayer(video) {
    var loading = document.createElement("div");
    loading.className = "player__loading";
    loading.textContent = "Video yuklanmoqda...";
    playerFrame.appendChild(loading);

    fetch(apiUrl("/bunny-token") + "?id=" + encodeURIComponent(video.bunny), {
      headers: { accept: "application/json" }
    })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (data) {
        if (!data || !data.url) throw new Error("Havola yo'q");

        var iframe = document.createElement("iframe");
        iframe.src = data.url;
        iframe.title = video.title || "Video";
        iframe.allow = "autoplay; fullscreen; picture-in-picture";
        iframe.allowFullscreen = true;

        playerFrame.textContent = "";
        playerFrame.appendChild(iframe);
      })
      .catch(function () {
        playerFrame.textContent = "";
        var message = document.createElement("p");
        message.className = "player__error";
        message.textContent =
          "Videoni yuklab bo'lmadi. Keyinroq qayta urinib ko'ring.";
        playerFrame.appendChild(message);
      });
  }

  function closePlayer() {
    if (player.hidden) return;

    playerFrame.textContent = "";
    player.hidden = true;
    updateScrollLock();
    activeVideo = null;

    if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus();
    }
  }

  function resumeLesson() {
    var target = null;

    if (lastLessonKey) {
      target = VIDEO_LIST.find(function (video) {
        return progressKey(video) === lastLessonKey;
      });
    }

    if (!target) {
      target = VIDEO_LIST.find(function (video) {
        var value = progressFor(video);
        return value.percent > 0 && !value.done && isPlayable(video);
      });
    }

    if (!target) {
      target = VIDEO_LIST.find(function (video) {
        return isPlayable(video) && (!video.paid || hasAccess);
      });
    }

    if (!target) {
      target = VIDEO_LIST.find(isPlayable);
    }

    if (!target) {
      showToast("Hozircha tayyor dars yo'q.");
      return;
    }

    if (target.paid && !hasAccess) {
      openPaywall();
      return;
    }

    openPlayer(target);
  }

  /* -------------------------------- To'lov ------------------------------- */

  function paymeMerchant() {
    return String(PAYWALL.paymeMerchantId || "").trim();
  }

  function isPaymeReady() {
    return paymeMerchant().length > 0;
  }

  /*
   * Payme checkout havolasi. Summa tiyinda yuboriladi (1 so'm = 100 tiyin).
   * `ac.uid` — foydalanuvchining brauzerda yaratilgan identifikatori;
   * to'lov tasdiqlanganda Payme webhook orqali aynan shu uid ochiladi.
   */
  function paymeCheckoutUrl() {
    var merchant = paymeMerchant();
    if (!merchant) return "";

    var amount = Math.round(Number(PAYWALL.price || 0)) * 100;
    var callback = location.origin + location.pathname + "?payme=1";
    var params =
      "m=" +
      merchant +
      ";ac.uid=" +
      currentUid() +
      ";a=" +
      amount +
      ";l=uz;c=" +
      callback;

    try {
      return "https://checkout.paycom.uz/" + btoa(params);
    } catch (error) {
      return "";
    }
  }

  function startPayme() {
    var url = paymeCheckoutUrl();

    if (!url) {
      paywallStatus.textContent =
        "Payme hali sozlanmagan. Karta orqali to'lovdan foydalaning.";
      return;
    }

    paywallStatus.textContent = "Payme'ga o'tilmoqda...";
    location.href = url;
  }

  /*
   * Admin panelda saqlangan darslar ro'yxatini oladi. Ro'yxat mavjud bo'lsa
   * (hatto bo'sh bo'lsa ham) u <video> teglaridan ustun turadi. Server
   * sozlanmagan bo'lsa, sayt avvalgi holatda ishlayveradi.
   */
  function loadVideos() {
    if (videosPromise) return videosPromise;

    videosPromise = fetch(apiUrl("/videos"), {
      headers: { accept: "application/json" },
      cache: "no-store"
    })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (data) {
        if (
          !data ||
          data.configured !== true ||
          !Array.isArray(data.videos)
        ) {
          return false;
        }

        VIDEO_LIST = data.videos.map(normalizeStoredVideo);
        render();
        return true;
      })
      .catch(function () {
        return false;
      })
      .then(function (result) {
        videosPromise = null;
        return result;
      });

    return videosPromise;
  }

  function loadRemoteConfig() {
    var promise =
      window.PK && window.PK.configPromise
        ? window.PK.configPromise
        : fetch(apiUrl("/config"), {
            headers: { accept: "application/json" }
          })
            .then(function (response) {
              if (!response.ok) throw new Error("HTTP " + response.status);
              return response.json();
            })
            .catch(function () {
              return null;
            });

    return promise.then(function (data) {
      if (!data) return;

      if (data.price) PAYWALL.price = Number(data.price);
      if (data.cardNumber) PAYWALL.cardNumber = String(data.cardNumber);
      if (typeof data.cardHolder === "string") {
        PAYWALL.cardHolder = data.cardHolder;
      }
      if (typeof data.telegram === "string") {
        PAYWALL.telegram = data.telegram;
      }
      if (typeof data.paymeMerchantId === "string") {
        PAYWALL.paymeMerchantId = data.paymeMerchantId;
      }
    });
  }

  function checkAccess() {
    if (accessPromise) return accessPromise;

    accessPromise = fetch(
      apiUrl("/access") + "?uid=" + encodeURIComponent(currentUid()),
      {
        headers: { accept: "application/json" },
        cache: "no-store"
      }
    )
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (data) {
        var granted = Boolean(data && data.paid);

        if (granted && !hasAccess) {
          hasAccess = true;
          render();
          updatePaywall();
        }

        return granted;
      })
      .catch(function () {
        return false;
      })
      .then(function (result) {
        accessPromise = null;
        return result;
      });

    return accessPromise;
  }

  /*
   * Payme'dan qaytgandan keyin (?payme=1) holatni bir necha marta
   * tekshiramiz: webhook ba'zan bir necha soniya kechikishi mumkin.
   */
  function handlePaymeReturn() {
    if (!/[?&]payme=1/.test(location.search)) return;

    try {
      history.replaceState(null, "", location.pathname + location.hash);
    } catch (error) {
      /* eski brauzerlarda e'tiborsiz qoldiramiz */
    }

    var tries = 0;

    function poll() {
      tries++;

      checkAccess().then(function (granted) {
        if (granted) {
          showToast("To'lov tasdiqlandi ✅");
          return;
        }

        if (tries < 20) setTimeout(poll, 3000);
      });
    }

    poll();
  }

  function updatePaywall() {
    if (!paywall) return;

    var amount = formatPrice(PAYWALL.price);
    var payme = isPaymeReady();

    if (paywallPrice) paywallPrice.textContent = amount;
    if (paywallAmount) paywallAmount.textContent = amount;

    if (paywallPayme) {
      paywallPayme.hidden = !payme || hasAccess;
      paywallPayme.disabled = hasAccess;
    }

    if (paywallAutoNote) paywallAutoNote.hidden = !payme || hasAccess;
    if (paywallOr) paywallOr.hidden = !payme || hasAccess;

    if (paywallManual && !payme) {
      paywallManual.open = true;
    }

    if (paywallCard) {
      paywallCard.textContent = formatCard(PAYWALL.cardNumber) || "—";
    }

    if (paywallHolder) {
      paywallHolder.textContent = PAYWALL.cardHolder
        ? "Qabul qiluvchi: " + PAYWALL.cardHolder
        : "";
      paywallHolder.hidden = !PAYWALL.cardHolder;
    }

    if (paywallTelegram) {
      var link = telegramLink();
      paywallTelegram.hidden = !link;
      if (link) paywallTelegram.href = link;
    }

    if (hasAccess) {
      if (paywallCheck) paywallCheck.disabled = true;
      if (paywallStatus && !paywallStatus.textContent) {
        paywallStatus.textContent =
          "To'lov tasdiqlangan — barcha darslar ochiq.";
      }
      return;
    }

    if (paywallCheck) paywallCheck.disabled = false;
  }

  function openPaywall() {
    if (!paywall) return;

    if (hasAccess) {
      showToast("Barcha darslar allaqachon ochiq ✓");
      return;
    }

    if (!account) {
      openAuth("login", { type: "paywall" });
      return;
    }

    lastFocusedPaywall = document.activeElement;
    paywall.hidden = false;
    updateScrollLock();
    paywallStatus.textContent = "";
    if (paywallCode) paywallCode.textContent = "—";
    updatePaywall();
    paywallClose.focus();
    if (paywallManual && paywallManual.open) ensureOrder();
    startPolling();
  }

  function closePaywall() {
    if (!paywall || paywall.hidden) return;

    paywall.hidden = true;
    updateScrollLock();
    stopPolling();

    if (lastFocusedPaywall && typeof lastFocusedPaywall.focus === "function") {
      lastFocusedPaywall.focus();
    }
  }

  function startPolling() {
    stopPolling();

    paywallTimer = setInterval(function () {
      if (!paywall || paywall.hidden) {
        stopPolling();
        return;
      }

      if (hasAccess) {
        stopPolling();
        return;
      }

      checkAccess().then(function (granted) {
        if (granted) {
          paywallStatus.textContent = "To'lov tasdiqlandi ✅";
          showToast("To'lov tasdiqlandi ✅");
          stopPolling();
          setTimeout(closePaywall, 1200);
        }
      });
    }, 5000);
  }

  function stopPolling() {
    if (paywallTimer) {
      clearInterval(paywallTimer);
      paywallTimer = null;
    }
  }

  function ensureOrder() {
    if (orderPromise) return orderPromise;

    orderPromise = fetch(apiUrl("/order"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify({ uid: currentUid() })
    })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (data) {
        if (!data || !data.code) throw new Error("Kod yo'q");

        orderCode = String(data.code);
        if (data.amount) PAYWALL.price = Number(data.amount);
        renderOrder();
        return orderCode;
      })
      .catch(function () {
        if (paywallCode) paywallCode.textContent = "—";
        paywallStatus.textContent =
          "Kod olib bo'lmadi. Internetni tekshirib, qayta urinib ko'ring.";
        return "";
      })
      .then(function (result) {
        orderPromise = null;
        return result;
      });

    return orderPromise;
  }

  function renderOrder() {
    if (paywallCode) paywallCode.textContent = orderCode || "—";
    if (paywallAmount) paywallAmount.textContent = formatPrice(PAYWALL.price);
    if (paywallPrice) paywallPrice.textContent = formatPrice(PAYWALL.price);
  }

  function copyCard() {
    var digits = String(PAYWALL.cardNumber || "").replace(/\D/g, "");
    if (!digits) return;

    function done() {
      if (!paywallCopy) return;

      paywallCopy.textContent = "Nusxalandi ✓";
      paywallCopy.classList.add("is-done");
      showToast("Karta raqami nusxalandi");

      setTimeout(function () {
        paywallCopy.textContent = "Nusxalash";
        paywallCopy.classList.remove("is-done");
      }, 1800);
    }

    function fallback() {
      var area = document.createElement("textarea");
      area.value = digits;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();

      try {
        document.execCommand("copy");
        done();
      } catch (error) {
        paywallStatus.textContent =
          "Nusxalab bo'lmadi. Karta raqamini qo'lda yozing.";
      }

      area.remove();
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(digits).then(done, fallback);
    } else {
      fallback();
    }
  }

  /* -------------------------------- Toast -------------------------------- */

  function showToast(message) {
    if (!toastEl) return;

    toastEl.textContent = message;
    toastEl.hidden = false;

    if (toastTimer) clearTimeout(toastTimer);

    toastTimer = setTimeout(function () {
      toastEl.hidden = true;
      toastTimer = null;
    }, 2800);
  }

  /* ------------------------------ Focus trap ----------------------------- */

  function focusable(container) {
    return Array.prototype.filter.call(
      container.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ),
      function (element) {
        return element.offsetParent !== null;
      }
    );
  }

  function trapFocus(container, event) {
    if (!container || event.key !== "Tab") return;

    var items = focusable(container);
    if (!items.length) return;

    var first = items[0];
    var last = items[items.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /* ------------------------------- Hodisalar ----------------------------- */

  if (playerClose) playerClose.addEventListener("click", closePlayer);

  var backdrop = player ? player.querySelector("[data-close]") : null;
  if (backdrop) backdrop.addEventListener("click", closePlayer);

  if (playerDone) {
    playerDone.addEventListener("click", function () {
      if (activeVideo) toggleDone(activeVideo);
    });
  }

  if (paywall) {
    paywallClose.addEventListener("click", closePaywall);

    var paywallBackdrop = paywall.querySelector("[data-paywall-close]");
    if (paywallBackdrop) {
      paywallBackdrop.addEventListener("click", closePaywall);
    }

    if (paywallCopy) {
      paywallCopy.addEventListener("click", copyCard);
    }

    if (paywallPayme) {
      paywallPayme.addEventListener("click", startPayme);
    }

    if (paywallManual) {
      paywallManual.addEventListener("toggle", function () {
        if (paywallManual.open) ensureOrder();
      });
    }

    paywallCheck.addEventListener("click", function () {
      paywallStatus.textContent = "Tekshirilmoqda...";

      checkAccess().then(function (granted) {
        if (granted) {
          paywallStatus.textContent = "To'lov tasdiqlandi ✅";
          showToast("To'lov tasdiqlandi ✅");
          setTimeout(closePaywall, 1000);
        } else {
          paywallStatus.textContent =
            "To'lov hali tasdiqlanmadi. Bir oz kutib, qayta urinib ko'ring.";
        }
      });
    });
  }

  if (accountButton) {
    accountButton.addEventListener("click", function () {
      openAuth("login");
    });
  }

  if (auth) {
    if (authClose) authClose.addEventListener("click", closeAuth);

    var authBackdrop = auth.querySelector("[data-auth-close]");
    if (authBackdrop) authBackdrop.addEventListener("click", closeAuth);

    Array.prototype.forEach.call(
      auth.querySelectorAll("[data-auth-tab]"),
      function (tab) {
        tab.addEventListener("click", function () {
          setAuthMode(tab.getAttribute("data-auth-tab"));
        });
      }
    );

    if (loginForm) {
      loginForm.addEventListener("submit", function (event) {
        event.preventDefault();
        submitAuth("login");
      });
    }

    if (registerForm) {
      registerForm.addEventListener("submit", function (event) {
        event.preventDefault();
        submitAuth("register");
      });
    }

    if (authLogout) authLogout.addEventListener("click", logoutAccount);
  }

  Array.prototype.forEach.call(filterButtons, function (button) {
    button.addEventListener("click", function () {
      setFilter(button.getAttribute("data-filter"));
    });
  });

  Array.prototype.forEach.call(
    document.querySelectorAll("[data-buy]"),
    function (button) {
      button.addEventListener("click", function () {
        if (hasAccess) {
          showToast("Barcha darslar allaqachon ochiq ✓");
          var catalog = document.getElementById("videolar");
          if (catalog) catalog.scrollIntoView({ behavior: "smooth" });
          return;
        }

        openPaywall();
      });
    }
  );

  if (resumeButton) resumeButton.addEventListener("click", resumeLesson);

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      if (auth && !auth.hidden) {
        closeAuth();
        return;
      }

      if (paywall && !paywall.hidden) {
        closePaywall();
        return;
      }

      closePlayer();
      return;
    }

    if (auth && !auth.hidden) {
      trapFocus(auth.querySelector(".auth__dialog"), event);
      return;
    }

    if (paywall && !paywall.hidden) {
      trapFocus(paywall.querySelector(".paywall__dialog"), event);
      return;
    }

    if (player && !player.hidden) {
      trapFocus(player.querySelector(".player__dialog"), event);
    }
  });

  if (searchInput) searchInput.addEventListener("input", render);

  /* ------------------------------- Ishga tushish ------------------------- */

  render();
  renderAuthState();

  loadVideos();

  loadRemoteConfig().then(function () {
    updatePaywall();
    render();
  });

  loadAccount().then(function () {
    render();
    updatePaywall();
    return checkAccess();
  });

  handlePaymeReturn();
})();
