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
    busy: false
  };

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
