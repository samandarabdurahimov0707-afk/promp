/* ==========================================================================
   Admin panel logikasi — Prompt injenering kursi
   --------------------------------------------------------------------------
   Faqat /api/admin bilan ishlaydi. Maxfiy kalit sessionStorage'da saqlanadi
   va har bir so'rovda yuboriladi. Barcha matn textContent orqali chiziladi.
   ========================================================================== */

(function () {
  "use strict";

  var API = "/api/admin";
  var STORAGE_KEY = "pk_admin_secret";
  var REFRESH_MS = 30000;

  var loginPanel = document.getElementById("login-panel");
  var loginForm = document.getElementById("login-form");
  var loginStatus = document.getElementById("login-status");
  var secretInput = document.getElementById("secret");
  var logoutButton = document.getElementById("logout");

  var dashboard = document.getElementById("dashboard");
  var ordersBody = document.getElementById("orders-body");
  var ordersEmpty = document.getElementById("orders-empty");
  var statusEl = document.getElementById("status");
  var manualStatus = document.getElementById("manual-status");
  var searchInput = document.getElementById("search");
  var statusFilter = document.getElementById("status-filter");
  var refreshButton = document.getElementById("refresh");
  var exportButton = document.getElementById("export");
  var autoRefresh = document.getElementById("auto-refresh");
  var codeInput = document.getElementById("code");
  var activateButton = document.getElementById("activate");
  var revokeButton = document.getElementById("revoke");
  var grantEmailInput = document.getElementById("grant-email");
  var grantButton = document.getElementById("grant");
  var revokeUserButton = document.getElementById("revoke-user");

  var videosBody = document.getElementById("videos-body");
  var videosEmpty = document.getElementById("videos-empty");
  var videosNote = document.getElementById("videos-note");
  var videosRefresh = document.getElementById("videos-refresh");
  var videosImport = document.getElementById("videos-import");
  var videosReset = document.getElementById("videos-reset");
  var videoForm = document.getElementById("video-form");
  var videoIdInput = document.getElementById("video-id");
  var videoTitleInput = document.getElementById("video-title");
  var videoDescriptionInput = document.getElementById("video-description");
  var videoDurationInput = document.getElementById("video-duration");
  var videoPosterInput = document.getElementById("video-poster");
  var videoSourceSelect = document.getElementById("video-source");
  var videoFileField = document.getElementById("video-file-field");
  var videoFileInput = document.getElementById("video-file");
  var videoFileNote = document.getElementById("video-file-note");
  var videoUrlField = document.getElementById("video-url-field");
  var videoUrlInput = document.getElementById("video-url");
  var videoPaidInput = document.getElementById("video-paid");
  var videoProgress = document.getElementById("video-progress");
  var videoProgressFill = document.getElementById("video-progress-fill");
  var videoProgressText = document.getElementById("video-progress-text");
  var videoSaveButton = document.getElementById("video-save");
  var videoCancelButton = document.getElementById("video-cancel");
  var videoStatus = document.getElementById("video-status");

  var statTotal = document.getElementById("stat-total");
  var statPending = document.getElementById("stat-pending");
  var statPaid = document.getElementById("stat-paid");
  var statRevenue = document.getElementById("stat-revenue");
  var statPaid30 = document.getElementById("stat-paid30");
  var statRevenue30 = document.getElementById("stat-revenue30");
  var statUsers = document.getElementById("stat-users");

  var state = {
    secret: "",
    orders: [],
    stats: null,
    timer: null,
    busy: false,
    videos: [],
    videosLoaded: false,
    videosConfigured: false,
    videosBusy: false
  };

  var UPLOAD_API = "/api/video-upload";
  var UPLOAD_CHUNK = 3 * 1024 * 1024;
  var MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
  var FILE_NOTE_DEFAULT =
    "MP4 tavsiya etiladi. Fayl 3 MB li bo'laklarda yuklanadi — sahifani yopmang.";

  /* ----------------------------- Yordamchilar ---------------------------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);

    return node;
  }

  function setStatus(target, text, isError) {
    if (!target) return;

    target.textContent = text || "";
    target.classList.toggle("is-error", Boolean(isError));
  }

  function formatSom(value) {
    var number = Math.round(Number(value) || 0);

    try {
      return number.toLocaleString("ru-RU") + " so'm";
    } catch (error) {
      return number + " so'm";
    }
  }

  function formatDate(value) {
    var timestamp = Number(value) || 0;
    if (!timestamp) return "—";

    try {
      return new Date(timestamp).toLocaleString("uz-UZ", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch (error) {
      return new Date(timestamp).toLocaleString();
    }
  }

  function statusLabel(status) {
    if (status === "paid") return "To'langan";
    if (status === "pending") return "Kutilayotgan";
    return "Bekor qilingan";
  }

  function sourceLabel(source) {
    return source === "payme" ? "Payme" : "Karta";
  }

  function readSecret() {
    try {
      return sessionStorage.getItem(STORAGE_KEY) || "";
    } catch (error) {
      return "";
    }
  }

  function saveSecret(value) {
    try {
      if (value) sessionStorage.setItem(STORAGE_KEY, value);
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      /* e'tiborsiz */
    }
  }

  /* -------------------------------- API ---------------------------------- */

  function call(action, extra) {
    var payload = { secret: state.secret, action: action };

    if (extra) {
      Object.keys(extra).forEach(function (key) {
        payload[key] = extra[key];
      });
    }

    return fetch(API, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify(payload)
    })
      .then(function (response) {
        return response
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            return { ok: response.ok, status: response.status, data: data || {} };
          });
      })
      .catch(function () {
        return {
          ok: false,
          status: 0,
          data: { error: "Serverga ulanib bo'lmadi. Internetni tekshiring." }
        };
      });
  }

  /* ------------------------------ Dashboard ------------------------------ */

  function renderStats(stats) {
    var data = stats || {};

    statTotal.textContent = String(data.total || 0);
    statPending.textContent = String(data.pending || 0);
    statPaid.textContent = String(data.paid || 0);
    statRevenue.textContent = formatSom(data.revenue);
    statPaid30.textContent = String(data.paid30 || 0);
    statUsers.textContent = String(data.users || 0);
    statRevenue30.textContent =
      formatSom(data.revenue30) + " · " + String(data.paid30 || 0) + " ta";
  }

  function visibleOrders() {
    var query = String(searchInput.value || "")
      .trim()
      .toLowerCase();
    var filter = statusFilter.value;

    return state.orders.filter(function (order) {
      if (filter !== "all" && order.status !== filter) return false;
      if (!query) return true;

      var haystack = [
        order.code,
        order.paymeId,
        order.uid,
        order.name,
        order.email,
        order.source,
        order.status
      ]
        .join(" ")
        .toLowerCase();

      return haystack.indexOf(query) !== -1;
    });
  }

  function actionButtons(order) {
    var wrap = el("div", "actions-cell");

    if (order.source === "manual" && order.status !== "paid") {
      var open = el(
        "button",
        "btn btn--small",
        order.status === "revoked" ? "Qayta ochish" : "Ochish"
      );
      open.type = "button";
      open.addEventListener("click", function () {
        activateCode(order.code);
      });
      wrap.appendChild(open);
      return wrap;
    }

    if (order.source === "manual" && order.status === "paid") {
      var revoke = el("button", "btn btn--danger btn--small", "Bekor qilish");
      revoke.type = "button";
      revoke.addEventListener("click", function () {
        revokeCode(order.code);
      });
      wrap.appendChild(revoke);
      return wrap;
    }

    wrap.appendChild(el("span", "muted small", "—"));
    return wrap;
  }

  function renderOrders() {
    var rows = visibleOrders();
    ordersBody.textContent = "";
    ordersEmpty.classList.toggle("is-hidden", rows.length > 0);

    rows.forEach(function (order) {
      var tr = document.createElement("tr");

      var codeCell = el("td");
      codeCell.setAttribute("data-label", "Kod");
      var code = el(
        "span",
        "order-code" + (order.source === "payme" ? " order-code--payme" : ""),
        order.source === "payme"
          ? "PAYME-" + String(order.paymeId || "").slice(0, 8) + "…"
          : order.code
      );
      code.title = order.code;
      codeCell.appendChild(code);

      var sourceCell = el("td");
      sourceCell.setAttribute("data-label", "Manba");
      sourceCell.appendChild(
        el(
          "span",
          "source-pill" + (order.source === "payme" ? " source-pill--payme" : ""),
          sourceLabel(order.source)
        )
      );

      var userCell = el("td", "user-cell");
      userCell.setAttribute("data-label", "Foydalanuvchi");

      if (order.email) {
        userCell.appendChild(el("span", "user-cell__email", order.email));
        if (order.name) {
          userCell.appendChild(el("span", "muted small", order.name));
        }
      } else {
        userCell.appendChild(
          el(
            "span",
            "muted small",
            order.uid ? String(order.uid).slice(0, 12) + "…" : "—"
          )
        );
      }

      var amountCell = el("td", "nowrap", formatSom(order.amount));
      amountCell.setAttribute("data-label", "Summa");

      var statusCell = el("td");
      statusCell.setAttribute("data-label", "Holat");
      statusCell.appendChild(
        el(
          "span",
          "status-pill status-pill--" + order.status,
          statusLabel(order.status)
        )
      );

      var createdCell = el("td", "muted small nowrap", formatDate(order.createdAt));
      createdCell.setAttribute("data-label", "Yaratilgan");

      var paidCell = el("td", "muted small nowrap", formatDate(order.paidAt));
      paidCell.setAttribute("data-label", "To'langan");

      var actionsCell = el("td");
      actionsCell.setAttribute("data-label", "Amal");
      actionsCell.appendChild(actionButtons(order));

      tr.appendChild(codeCell);
      tr.appendChild(sourceCell);
      tr.appendChild(userCell);
      tr.appendChild(amountCell);
      tr.appendChild(statusCell);
      tr.appendChild(createdCell);
      tr.appendChild(paidCell);
      tr.appendChild(actionsCell);
      ordersBody.appendChild(tr);
    });
  }

  function applyOverview(data) {
    state.orders = Array.isArray(data.orders) ? data.orders : [];
    state.stats = data.stats || {};
    renderStats(state.stats);
    renderOrders();
  }

  function loadOverview(options) {
    var quiet = Boolean(options && options.quiet);

    if (!state.secret || state.busy) return Promise.resolve(false);

    state.busy = true;
    if (!quiet) setStatus(statusEl, "Yuklanmoqda...");

    return call("overview")
      .then(function (result) {
        if (result.status === 401) {
          handleUnauthorized();
          return false;
        }

        if (!result.ok) {
          setStatus(
            statusEl,
            result.data.error || "Ma'lumotlarni yuklab bo'lmadi.",
            true
          );
          return false;
        }

        applyOverview(result.data);

        if (!quiet) {
          setStatus(
            statusEl,
            "Yangilandi: " +
              new Date().toLocaleTimeString("uz-UZ", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
              })
          );
        }

        return true;
      })
      .then(function (result) {
        state.busy = false;
        return result;
      });
  }

  /* ------------------------------- Kirish -------------------------------- */

  function enterDashboard() {
    loginPanel.classList.add("is-hidden");
    dashboard.classList.remove("is-hidden");
    logoutButton.classList.remove("is-hidden");
    setStatus(loginStatus, "");
    startAutoRefresh();
    loadVideos({ quiet: true });
  }

  function leaveDashboard() {
    stopAutoRefresh();
    dashboard.classList.add("is-hidden");
    logoutButton.classList.add("is-hidden");
    loginPanel.classList.remove("is-hidden");
    ordersBody.textContent = "";
    ordersEmpty.classList.add("is-hidden");
    setStatus(statusEl, "");
    setStatus(manualStatus, "");

    state.videos = [];
    state.videosLoaded = false;
    state.videosConfigured = false;
    if (videosBody) videosBody.textContent = "";
    if (videosEmpty) videosEmpty.classList.add("is-hidden");
    if (videosNote) videosNote.hidden = true;
    resetVideoForm();
    videoMessage("");
  }

  function handleUnauthorized() {
    state.secret = "";
    saveSecret("");
    leaveDashboard();
    setStatus(loginStatus, "Maxfiy kalit noto'g'ri yoki muddati tugagan.", true);
    secretInput.focus();
  }

  function login() {
    var value = secretInput.value.trim();

    if (!value) {
      setStatus(loginStatus, "Maxfiy kalitni kiriting.", true);
      secretInput.focus();
      return;
    }

    state.secret = value;
    setStatus(loginStatus, "Tekshirilmoqda...");

    call("overview")
      .then(function (result) {
        if (result.status === 401) {
          state.secret = "";
          setStatus(loginStatus, "Maxfiy kalit noto'g'ri.", true);
          secretInput.focus();
          return;
        }

        if (!result.ok) {
          setStatus(
            loginStatus,
            result.data.error || "Serverga ulanib bo'lmadi.",
            true
          );
          return;
        }

        saveSecret(value);
        applyOverview(result.data);
        enterDashboard();
      })
      .catch(function () {
        setStatus(loginStatus, "Kutilmagan xatolik. Qayta urinib ko'ring.", true);
      });
  }

  /* --------------------------- Qo'lda tasdiqlash ------------------------- */

  function activateCode(code) {
    var value = String(code || codeInput.value || "")
      .trim()
      .toUpperCase();

    if (!state.secret) {
      handleUnauthorized();
      return;
    }

    if (!value) {
      setStatus(manualStatus, "Buyurtma kodini kiriting.", true);
      codeInput.focus();
      return;
    }

    setStatus(manualStatus, "Tekshirilmoqda...");

    call("activate", { code: value }).then(function (result) {
      if (result.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!result.ok) {
        setStatus(
          manualStatus,
          result.data.error || "Xatolik yuz berdi.",
          true
        );
        return;
      }

      setStatus(
        manualStatus,
        result.data.alreadyPaid
          ? "Bu kod allaqachon ochilgan."
          : result.data.reopened
            ? "Kirish huquqi qayta tiklandi: " + result.data.code + " ✓"
            : "Darslar ochildi: " + result.data.code + " ✓"
      );

      codeInput.value = "";
      loadOverview({ quiet: true });
    });
  }

  function revokeCode(code) {
    var value = String(code || codeInput.value || "")
      .trim()
      .toUpperCase();

    if (!state.secret) {
      handleUnauthorized();
      return;
    }

    if (!value) {
      setStatus(manualStatus, "Bekor qilish uchun kodni kiriting.", true);
      codeInput.focus();
      return;
    }

    if (
      !window.confirm(
        "Kod " + value + " uchun kirish huquqi bekor qilinsinmi?"
      )
    ) {
      return;
    }

    setStatus(manualStatus, "Bekor qilinmoqda...");

    call("revoke", { code: value }).then(function (result) {
      if (result.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!result.ok) {
        setStatus(
          manualStatus,
          result.data.error || "Xatolik yuz berdi.",
          true
        );
        return;
      }

      setStatus(
        manualStatus,
        result.data.stillPaid
          ? "Bekor qilindi, lekin foydalanuvchida boshqa to'lov bor."
          : "Kirish huquqi bekor qilindi."
      );

      codeInput.value = "";
      loadOverview({ quiet: true });
    });
  }

  /* -------------------------- Email orqali ruxsat ------------------------ */

  function grantByEmail() {
    var value = String(grantEmailInput.value || "").trim();

    if (!state.secret) {
      handleUnauthorized();
      return;
    }

    if (!value) {
      setStatus(manualStatus, "Email manzilini kiriting.", true);
      grantEmailInput.focus();
      return;
    }

    setStatus(manualStatus, "Hisob tekshirilmoqda...");

    call("grant", { email: value }).then(function (result) {
      if (result.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!result.ok) {
        setStatus(
          manualStatus,
          result.data.error || "Xatolik yuz berdi.",
          true
        );
        return;
      }

      var user = result.data.user || {};

      setStatus(
        manualStatus,
        result.data.alreadyPaid
          ? "Bu hisob allaqachon ochiq: " + (user.email || value)
          : "Hisob ochildi: " + (user.email || value) + " ✓"
      );

      grantEmailInput.value = "";
      loadOverview({ quiet: true });
    });
  }

  function revokeUserByEmail() {
    var value = String(grantEmailInput.value || "").trim();

    if (!state.secret) {
      handleUnauthorized();
      return;
    }

    if (!value) {
      setStatus(manualStatus, "Email manzilini kiriting.", true);
      grantEmailInput.focus();
      return;
    }

    if (
      !window.confirm(
        value + " hisobining kirish huquqi bekor qilinsinmi?"
      )
    ) {
      return;
    }

    setStatus(manualStatus, "Bekor qilinmoqda...");

    call("revokeUser", { email: value }).then(function (result) {
      if (result.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!result.ok) {
        setStatus(
          manualStatus,
          result.data.error || "Xatolik yuz berdi.",
          true
        );
        return;
      }

      setStatus(
        manualStatus,
        result.data.alreadyRevoked
          ? "Bu hisob allaqachon yopiq."
          : "Hisobning kirish huquqi bekor qilindi."
      );

      grantEmailInput.value = "";
      loadOverview({ quiet: true });
    });
  }

  /* -------------------------------- CSV ---------------------------------- */

  function csvCell(value) {
    return '"' + String(value === undefined || value === null ? "" : value).replace(/"/g, '""') + '"';
  }

  function exportCsv() {
    var rows = visibleOrders();

    if (!rows.length) {
      setStatus(statusEl, "Yuklab olish uchun yozuv yo'q.", true);
      return;
    }

    var lines = [
      [
        "Kod",
        "Manba",
        "Summa (so'm)",
        "Holat",
        "Yaratilgan",
        "To'langan",
        "Ism",
        "Email",
        "Foydalanuvchi ID"
      ]
        .map(csvCell)
        .join(";")
    ];

    rows.forEach(function (order) {
      lines.push(
        [
          order.code,
          sourceLabel(order.source),
          order.amount,
          statusLabel(order.status),
          formatDate(order.createdAt),
          formatDate(order.paidAt),
          order.name,
          order.email,
          order.uid
        ]
          .map(csvCell)
          .join(";")
      );
    });

    var blob = new Blob(["\ufeff" + lines.join("\r\n")], {
      type: "text/csv;charset=utf-8;"
    });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    var stamp = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = "buyurtmalar-" + stamp + ".csv";
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);

    setStatus(statusEl, rows.length + " ta yozuv CSV faylga yuklandi.");
  }

  /* --------------------------- Avtomatik yangilash ----------------------- */

  function startAutoRefresh() {
    stopAutoRefresh();

    if (!autoRefresh.checked) return;

    state.timer = setInterval(function () {
      if (document.hidden) return;
      loadOverview({ quiet: true });
    }, REFRESH_MS);
  }

  function stopAutoRefresh() {
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
  }

  /* ----------------------------- Dars videolari -------------------------- */

  function videoMessage(text, isError) {
    setStatus(videoStatus, text, isError);
  }

  function formatBytes(value) {
    var bytes = Number(value) || 0;

    if (!bytes) return "—";
    if (bytes >= 1024 * 1024 * 1024) {
      return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
    }
    if (bytes >= 1024 * 1024) {
      return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    }
    if (bytes >= 1024) return Math.round(bytes / 1024) + " KB";

    return bytes + " B";
  }

  function newId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }

    return (
      "v" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
    );
  }

  function lessonNumber(title) {
    var match = String(title || "").match(/(\d+)\s*[-\u2013.]?\s*dars/i);
    if (match) return Number(match[1]);

    match = String(title || "").match(/^\s*(\d+)\s*[.)-]/);
    return match ? Number(match[1]) : 0;
  }

  function videoSourceLabel(video) {
    if (video.source === "upload") return "Fayl";
    if (video.source === "youtube") return "YouTube";
    return "Havola";
  }

  function setVideoBusy(busy) {
    state.videosBusy = Boolean(busy);

    if (videoSaveButton) videoSaveButton.disabled = Boolean(busy);
    if (videoCancelButton) videoCancelButton.disabled = Boolean(busy);
    if (videoFileInput) videoFileInput.disabled = Boolean(busy);
  }

  function setUploadProgress(percent, done, total) {
    var value = Math.max(0, Math.min(100, Math.round(percent * 100)));

    if (!videoProgress) return;

    videoProgress.classList.remove("is-hidden");
    if (videoProgressFill) videoProgressFill.style.width = value + "%";
    if (videoProgressText) {
      videoProgressText.textContent =
        value + "% · " + String(done) + "/" + String(total);
    }
  }

  function renderVideos() {
    if (!videosBody) return;

    videosBody.textContent = "";
    if (videosEmpty) {
      videosEmpty.classList.toggle("is-hidden", state.videos.length > 0);
    }

    if (videosNote) {
      if (!state.videosLoaded) {
        videosNote.hidden = true;
      } else if (!state.videosConfigured) {
        videosNote.hidden = false;
        videosNote.textContent =
          "Diqqat: sayt hozir index.html dagi eski darslardan foydalanmoqda. " +
          "Bu ro'yxatga birinchi dars saqlanganda ular almashtiriladi — " +
          "avval «Eski darslarni qo'shish» tugmasini bosing.";
      } else {
        videosNote.hidden = true;
      }
    }

    state.videos.forEach(function (video, index) {
      var tr = document.createElement("tr");

      var numberCell = el(
        "td",
        "nowrap",
        String(index + 1).padStart(2, "0")
      );
      numberCell.setAttribute("data-label", "#");

      var titleCell = el("td", "video-cell");
      titleCell.setAttribute("data-label", "Dars");
      titleCell.appendChild(
        el("span", "video-cell__title", video.title || "Nomsiz dars")
      );

      var details = [];

      if (video.description) details.push(video.description);
      if (video.duration) details.push(video.duration);
      if (video.source === "upload" && video.size) {
        details.push(formatBytes(video.size));
      }

      if (details.length) {
        titleCell.appendChild(
          el("span", "video-cell__desc", details.join(" · "))
        );
      }

      var sourceCell = el("td");
      sourceCell.setAttribute("data-label", "Manba");
      sourceCell.appendChild(
        el("span", "video-pill", videoSourceLabel(video))
      );

      var statusCell = el("td");
      statusCell.setAttribute("data-label", "Holat");
      statusCell.appendChild(
        el(
          "span",
          "video-pill " + (video.paid ? "video-pill--paid" : "video-pill--free"),
          video.paid ? "Pullik" : "Bepul"
        )
      );

      var actionsCell = el("td");
      actionsCell.setAttribute("data-label", "Amal");
      var actions = el("div", "video-row-actions");

      var up = el("button", "btn btn--ghost btn--small icon-btn", "↑");
      up.type = "button";
      up.title = "Yuqoriga";
      up.disabled = index === 0;
      up.addEventListener("click", function () {
        moveVideo(index, -1);
      });
      actions.appendChild(up);

      var down = el("button", "btn btn--ghost btn--small icon-btn", "↓");
      down.type = "button";
      down.title = "Pastga";
      down.disabled = index === state.videos.length - 1;
      down.addEventListener("click", function () {
        moveVideo(index, 1);
      });
      actions.appendChild(down);

      var toggle = el(
        "button",
        "btn btn--ghost btn--small",
        video.paid ? "Bepul qilish" : "Pullik qilish"
      );
      toggle.type = "button";
      toggle.addEventListener("click", function () {
        togglePaid(index);
      });
      actions.appendChild(toggle);

      var edit = el("button", "btn btn--small", "Tahrirlash");
      edit.type = "button";
      edit.addEventListener("click", function () {
        startEdit(video.id);
      });
      actions.appendChild(edit);

      var removeButton = el("button", "btn btn--danger btn--small", "O'chirish");
      removeButton.type = "button";
      removeButton.addEventListener("click", function () {
        deleteVideo(index);
      });
      actions.appendChild(removeButton);

      actionsCell.appendChild(actions);

      tr.appendChild(numberCell);
      tr.appendChild(titleCell);
      tr.appendChild(sourceCell);
      tr.appendChild(statusCell);
      tr.appendChild(actionsCell);
      videosBody.appendChild(tr);
    });
  }

  function loadVideos(options) {
    var quiet = Boolean(options && options.quiet);

    if (!state.secret) return Promise.resolve(false);

    if (!quiet) videoMessage("Darslar yuklanmoqda...");

    return call("videos")
      .then(function (result) {
        if (result.status === 401) {
          handleUnauthorized();
          return false;
        }

        if (!result.ok) {
          videoMessage(
            result.data.error || "Darslarni yuklab bo'lmadi.",
            true
          );
          return false;
        }

        state.videos = Array.isArray(result.data.videos)
          ? result.data.videos
          : [];
        state.videosConfigured = result.data.configured === true;
        state.videosLoaded = true;
        renderVideos();

        if (!quiet) videoMessage("Darslar yangilandi.");
        return true;
      })
      .catch(function () {
        videoMessage("Darslarni yuklab bo'lmadi.", true);
        return false;
      });
  }

  function persistVideos(nextList, message) {
    if (!state.secret) {
      handleUnauthorized();
      return Promise.resolve(false);
    }

    videoMessage("Saqlanmoqda...");

    return call("saveVideos", { videos: nextList })
      .then(function (result) {
        if (result.status === 401) {
          handleUnauthorized();
          return false;
        }

        if (!result.ok) {
          videoMessage(result.data.error || "Saqlab bo'lmadi.", true);
          return false;
        }

        state.videos = Array.isArray(result.data.videos)
          ? result.data.videos
          : nextList;
        state.videosConfigured = true;
        state.videosLoaded = true;
        renderVideos();
        videoMessage(message || "Saqlandi ✓");
        return true;
      })
      .catch(function () {
        videoMessage("Saqlab bo'lmadi. Internetni tekshiring.", true);
        return false;
      });
  }

  function moveVideo(index, delta) {
    var target = index + delta;

    if (target < 0 || target >= state.videos.length) return;

    var previous = state.videos;
    var next = state.videos.slice();
    var moved = next[index];

    next[index] = next[target];
    next[target] = moved;

    state.videos = next;
    renderVideos();

    persistVideos(next, "Tartib saqlandi ✓").then(function (ok) {
      if (!ok) {
        state.videos = previous;
        renderVideos();
      }
    });
  }

  function togglePaid(index) {
    var previous = state.videos;
    var next = state.videos.map(function (video, position) {
      if (position !== index) return video;

      return Object.assign({}, video, { paid: !video.paid });
    });

    state.videos = next;
    renderVideos();

    persistVideos(next, "Holat saqlandi ✓").then(function (ok) {
      if (!ok) {
        state.videos = previous;
        renderVideos();
      }
    });
  }

  function deleteVideo(index) {
    var video = state.videos[index];
    if (!video) return;

    if (
      !window.confirm(
        "“" + (video.title || "Dars") + "” o'chirilsinmi? Video fayl ham o'chadi."
      )
    ) {
      return;
    }

    var previous = state.videos;
    var next = state.videos.slice();
    next.splice(index, 1);

    state.videos = next;
    renderVideos();

    persistVideos(next, "Dars o'chirildi.").then(function (ok) {
      if (!ok) {
        state.videos = previous;
        renderVideos();
      }
    });
  }

  function syncVideoForm() {
    if (!videoSourceSelect) return;

    var source = videoSourceSelect.value;

    if (videoFileField) {
      videoFileField.classList.toggle("is-hidden", source !== "upload");
    }

    if (videoUrlField) {
      videoUrlField.classList.toggle("is-hidden", source === "upload");
    }

    if (videoUrlInput) {
      videoUrlInput.placeholder =
        source === "youtube"
          ? "https://youtu.be/VIDEO_ID"
          : "https://... yoki videos/fayl.mp4";
    }
  }

  function resetVideoForm() {
    if (!videoForm) return;

    videoForm.reset();
    if (videoIdInput) videoIdInput.value = "";
    if (videoSourceSelect) videoSourceSelect.value = "upload";
    if (videoFileNote) videoFileNote.textContent = FILE_NOTE_DEFAULT;
    if (videoCancelButton) videoCancelButton.classList.add("is-hidden");
    if (videoProgress) videoProgress.classList.add("is-hidden");
    if (videoProgressFill) videoProgressFill.style.width = "0%";
    if (videoProgressText) videoProgressText.textContent = "0%";
    syncVideoForm();
  }

  function startEdit(id) {
    var video = state.videos.find(function (item) {
      return item.id === id;
    });

    if (!video) return;

    if (videoIdInput) videoIdInput.value = video.id;
    if (videoTitleInput) videoTitleInput.value = video.title || "";
    if (videoDescriptionInput) {
      videoDescriptionInput.value = video.description || "";
    }
    if (videoDurationInput) videoDurationInput.value = video.duration || "";
    if (videoPosterInput) videoPosterInput.value = video.poster || "";
    if (videoSourceSelect) videoSourceSelect.value = video.source || "url";
    if (videoUrlInput) {
      videoUrlInput.value = video.source === "upload" ? "" : video.src || "";
    }
    if (videoPaidInput) videoPaidInput.checked = Boolean(video.paid);
    if (videoFileInput) videoFileInput.value = "";
    if (videoFileNote) {
      videoFileNote.textContent =
        video.source === "upload"
          ? "Yangi fayl tanlamasangiz, avvalgi video saqlanadi."
          : FILE_NOTE_DEFAULT;
    }
    if (videoCancelButton) videoCancelButton.classList.remove("is-hidden");
    if (videoProgress) videoProgress.classList.add("is-hidden");

    syncVideoForm();
    videoMessage("");

    if (videoForm && typeof videoForm.scrollIntoView === "function") {
      videoForm.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    if (videoTitleInput) videoTitleInput.focus();
  }

  /* --------------------------- Fayl yuklash ------------------------------ */

  function readFileChunk(file, start, end) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();

      reader.onload = function () {
        resolve(reader.result);
      };

      reader.onerror = function () {
        reject(reader.error || new Error("Faylni o'qib bo'lmadi"));
      };

      reader.readAsArrayBuffer(file.slice(start, end));
    });
  }

  function toBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var pieces = [];
    var step = 0x8000;

    for (var index = 0; index < bytes.length; index += step) {
      pieces.push(
        String.fromCharCode.apply(
          null,
          bytes.subarray(index, Math.min(index + step, bytes.length))
        )
      );
    }

    return window.btoa(pieces.join(""));
  }

  function uploadCall(payload) {
    return fetch(UPLOAD_API, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify(payload)
    })
      .then(function (response) {
        return response
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            if (response.status === 401) handleUnauthorized();
            if (!response.ok) {
              throw new Error(
                data.error || "Yuklashda xatolik (" + response.status + ")"
              );
            }

            return data || {};
          });
      })
      .catch(function (error) {
        if (error && error.message) throw error;
        throw new Error("Serverga ulanib bo'lmadi. Internetni tekshiring.");
      });
  }

  function uploadVideo(file, onProgress) {
    return uploadCall({
      secret: state.secret,
      action: "init",
      filename: file.name,
      size: file.size,
      mime: file.type || "video/mp4",
      chunkSize: UPLOAD_CHUNK
    }).then(function (init) {
      var uploadId = init.uploadId;
      var chunkSize = Number(init.chunkSize) || UPLOAD_CHUNK;
      var chunkCount = Number(init.chunkCount) || 1;
      var index = 0;

      function next() {
        if (index >= chunkCount) {
          return uploadCall({
            secret: state.secret,
            action: "finish",
            uploadId: uploadId
          }).then(function (result) {
            if (!result.video) throw new Error("Yuklash natijasi yo'q");
            return result.video;
          });
        }

        var current = index;
        index += 1;

        var start = current * chunkSize;
        var end = Math.min(file.size, start + chunkSize);

        return readFileChunk(file, start, end)
          .then(function (buffer) {
            return uploadCall({
              secret: state.secret,
              action: "chunk",
              uploadId: uploadId,
              index: current,
              data: toBase64(buffer)
            });
          })
          .then(function () {
            if (onProgress) {
              onProgress((current + 1) / chunkCount, current + 1, chunkCount);
            }

            return next();
          });
      }

      return next().catch(function (error) {
        uploadCall({
          secret: state.secret,
          action: "abort",
          uploadId: uploadId
        }).catch(function () {
          /* tozalash imkoni bo'lmasa ham asosiy xatoni ko'rsatamiz */
        });

        throw error;
      });
    });
  }

  /* ------------------------------ Saqlash -------------------------------- */

  function commitVideo(record, existing, previous) {
    var next = state.videos.slice();
    var position = -1;

    if (existing) {
      position = next.findIndex(function (video) {
        return video.id === existing.id;
      });
    }

    if (position === -1) next.push(record);
    else next[position] = record;

    state.videos = next;
    renderVideos();

    return persistVideos(
      next,
      existing ? "Dars yangilandi ✓" : "Dars qo'shildi ✓"
    ).then(function (ok) {
      if (ok) {
        resetVideoForm();
        return true;
      }

      state.videos = previous;
      renderVideos();
      return false;
    });
  }

  function saveVideo(event) {
    event.preventDefault();

    if (state.videosBusy) return;

    var title = String(videoTitleInput.value || "").trim();

    if (!title) {
      videoMessage("Dars nomini kiriting.", true);
      videoTitleInput.focus();
      return;
    }

    var editingId = String(videoIdInput.value || "");
    var existing = editingId
      ? state.videos.find(function (video) {
          return video.id === editingId;
        })
      : null;

    var source = videoSourceSelect.value;
    var file =
      videoFileInput.files && videoFileInput.files[0]
        ? videoFileInput.files[0]
        : null;

    var base = {
      id: editingId || newId(),
      title: title,
      description: String(videoDescriptionInput.value || "").trim(),
      duration: String(videoDurationInput.value || "").trim(),
      poster: String(videoPosterInput.value || "").trim(),
      paid: Boolean(videoPaidInput.checked),
      createdAt: existing ? Number(existing.createdAt) || Date.now() : Date.now()
    };

    var previous = state.videos;

    if (source === "upload") {
      if (file) {
        if (file.size > MAX_VIDEO_BYTES) {
          videoMessage("Fayl juda katta (maksimal 1 GB).", true);
          return;
        }

        setVideoBusy(true);
        videoMessage("Video yuklanmoqda...");

        uploadVideo(file, function (percent, done, total) {
          setUploadProgress(percent, done, total);
          videoMessage(
            "Yuklanmoqda: " +
              Math.round(percent * 100) +
              "% (" +
              formatBytes(file.size * percent) +
              " / " +
              formatBytes(file.size) +
              ")"
          );
        })
          .then(function (uploaded) {
            var record = Object.assign({}, base, uploaded, {
              id: base.id,
              createdAt: base.createdAt
            });

            if (videoProgress) videoProgress.classList.add("is-hidden");
            return commitVideo(record, existing, previous);
          })
          .catch(function (error) {
            if (videoProgress) videoProgress.classList.add("is-hidden");
            videoMessage(
              error && error.message
                ? error.message
                : "Videoni yuklab bo'lmadi.",
              true
            );
          })
          .then(function () {
            setVideoBusy(false);
          });

        return;
      }

      if (!existing || existing.source !== "upload") {
        videoMessage("Video faylni tanlang.", true);
        videoFileInput.focus();
        return;
      }

      var kept = Object.assign({}, existing, base, {
        source: "upload",
        createdAt: base.createdAt
      });

      commitVideo(kept, existing, previous);
      return;
    }

    var src = String(videoUrlInput.value || "").trim();

    if (!src) {
      videoMessage("Video havolasini kiriting.", true);
      videoUrlInput.focus();
      return;
    }

    commitVideo(
      Object.assign({}, base, { source: source, src: src }),
      existing,
      previous
    );
  }

  /* ------------------- index.html dagi darslarni ko'chirish ---------------- */

  /* Darsni solishtirish kaliti: manba havolasi, bo'lmasa nomi. */
  function videoKey(video) {
    var src = String((video && video.src) || "").trim().toLowerCase();
    if (src) return "src:" + src;

    var title = String((video && video.title) || "").trim().toLowerCase();
    if (title) return "title:" + title;

    return "id:" + String((video && video.id) || "");
  }

  /*
    index.html darslarini mavjud ro'yxatga qo'shadi.
    Takroriy darslar qo'shilmaydi, mavjud (yuklangan) videolar saqlanadi.
    Yangi darslar o'z o'rniga — oldingi darsdan keyin qo'yiladi.
  */
  function mergeVideos(current, incoming) {
    var merged = current.slice();
    var insertAt = 0;

    incoming.forEach(function (video) {
      var key = videoKey(video);
      var found = -1;

      for (var i = 0; i < merged.length; i += 1) {
        if (videoKey(merged[i]) === key) {
          found = i;
          break;
        }
      }

      if (found === -1) {
        merged.splice(insertAt, 0, video);
        insertAt += 1;
      } else {
        insertAt = found + 1;
      }
    });

    return merged;
  }

  function importVideos() {
    if (!state.secret) {
      handleUnauthorized();
      return;
    }

    if (
      state.videos.length &&
      !window.confirm(
        "index.html dagi darslar ro'yxatga qo'shiladi. Mavjud darslar va " +
          "yuklangan videolar saqlanadi. Davom etilsinmi?"
      )
    ) {
      return;
    }

    videoMessage("Mavjud darslar o'qilmoqda...");

    fetch("index.html", { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, "text/html");
        var container = doc.getElementById("video-tags");

        if (!container) {
          throw new Error("index.html da video ro'yxati topilmadi");
        }

        var paidFrom = Number(container.getAttribute("data-paid-from")) || 0;
        var tags = Array.prototype.slice.call(
          container.querySelectorAll("video")
        );

        var videos = tags.map(function (tag, index) {
          var title =
            tag.getAttribute("data-title") ||
            tag.getAttribute("title") ||
            "Nomsiz dars";
          var number = index + 1;
          var lesson = lessonNumber(title);
          var youtube = tag.getAttribute("data-youtube") || "";
          var src = tag.getAttribute("src") || "";
          var free = tag.getAttribute("data-free") === "true";
          var paid =
            !free &&
            (tag.getAttribute("data-paid") === "true" ||
              (paidFrom > 0 &&
                (lesson > 0 ? lesson >= paidFrom : number >= paidFrom)));

          if (!src) {
            var sourceTag = tag.querySelector("source");
            if (sourceTag) src = sourceTag.getAttribute("src") || "";
          }

          return {
            id: newId(),
            title: title,
            description: tag.getAttribute("data-description") || "",
            duration: tag.getAttribute("data-duration") || "",
            poster: tag.getAttribute("poster") || "",
            paid: paid,
            source: youtube ? "youtube" : "url",
            src: youtube || src,
            createdAt: Date.now()
          };
        });

        if (!videos.length) throw new Error("index.html da dars topilmadi");

        var merged = mergeVideos(state.videos, videos);
        var added = merged.length - state.videos.length;

        if (!added) {
          videoMessage("Barcha darslar allaqachon ro'yxatda ✓");
          return true;
        }

        return persistVideos(
          merged,
          added + " ta dars qo'shildi ✓"
        );
      })
      .catch(function (error) {
        videoMessage(
          error && error.message
            ? error.message
            : "Mavjud darslarni o'qib bo'lmadi.",
          true
        );
      });
  }

  /* ------------------------ Ro'yxatni tozalash --------------------------- */

  function resetVideos() {
    if (!state.secret) {
      handleUnauthorized();
      return;
    }

    if (
      !window.confirm(
        "Barcha darslar ro'yxati o'chirilsinmi? Sayt yana index.html dagi " +
          "eski darslarga qaytadi. Yuklangan videolar ham o'chadi."
      )
    ) {
      return;
    }

    videoMessage("Tozalanmoqda...");

    call("resetVideos")
      .then(function (result) {
        if (result.status === 401) {
          handleUnauthorized();
          return;
        }

        if (!result.ok) {
          videoMessage(result.data.error || "Tozalab bo'lmadi.", true);
          return;
        }

        state.videos = [];
        state.videosConfigured = false;
        state.videosLoaded = true;
        renderVideos();
        resetVideoForm();
        videoMessage("Ro'yxat tozalandi. Sayt eski darslarga qaytdi.");
      })
      .catch(function () {
        videoMessage("Tozalab bo'lmadi. Internetni tekshiring.", true);
      });
  }

  /* ------------------------------- Hodisalar ----------------------------- */

  loginForm.addEventListener("submit", function (event) {
    event.preventDefault();
    login();
  });

  logoutButton.addEventListener("click", function () {
    state.secret = "";
    saveSecret("");
    secretInput.value = "";
    leaveDashboard();
    setStatus(loginStatus, "Tizimdan chiqdingiz.");
  });

  refreshButton.addEventListener("click", function () {
    loadOverview();
  });

  exportButton.addEventListener("click", exportCsv);

  searchInput.addEventListener("input", renderOrders);
  statusFilter.addEventListener("change", renderOrders);

  autoRefresh.addEventListener("change", function () {
    if (autoRefresh.checked) startAutoRefresh();
    else stopAutoRefresh();
  });

  activateButton.addEventListener("click", function () {
    activateCode("");
  });

  revokeButton.addEventListener("click", function () {
    revokeCode("");
  });

  codeInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      activateCode("");
    }
  });

  grantButton.addEventListener("click", grantByEmail);
  revokeUserButton.addEventListener("click", revokeUserByEmail);

  grantEmailInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      grantByEmail();
    }
  });

  if (videoForm) videoForm.addEventListener("submit", saveVideo);

  if (videoCancelButton) {
    videoCancelButton.addEventListener("click", function () {
      resetVideoForm();
      videoMessage("");
    });
  }

  if (videoSourceSelect) {
    videoSourceSelect.addEventListener("change", syncVideoForm);
  }

  if (videosRefresh) {
    videosRefresh.addEventListener("click", function () {
      loadVideos();
    });
  }

  if (videosImport) {
    videosImport.addEventListener("click", importVideos);
  }

  if (videosReset) {
    videosReset.addEventListener("click", resetVideos);
  }

  syncVideoForm();

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && state.secret) loadOverview({ quiet: true });
  });

  /* ------------------------------ Ishga tushish -------------------------- */

  var saved = readSecret();

  if (saved) {
    state.secret = saved;
    secretInput.value = saved;

    call("overview").then(function (result) {
      if (result.ok) {
        applyOverview(result.data);
        enterDashboard();
      } else if (result.status === 401) {
        state.secret = "";
        saveSecret("");
        secretInput.value = "";
      }
    });
  }
})();
