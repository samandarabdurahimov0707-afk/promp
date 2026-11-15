/* ==========================================================================
   Kurs egasi uchun admin API (faqat maxfiy kalit bilan).
   POST /api/admin
     { "secret": "...", "action": "overview" }
     { "secret": "...", "action": "list" }
     { "secret": "...", "action": "activate",   "code": "ABC123" }
     { "secret": "...", "action": "revoke",     "code": "ABC123" }
     { "secret": "...", "action": "grant",      "email": "..." }
     { "secret": "...", "action": "revokeUser", "email": "..." }
   --------------------------------------------------------------------------
   `overview` — dashboard uchun statistika va barcha buyurtmalar ro'yxati.
   `list`     — faqat kutilayotgan karta o'tkazmalari (eski interfeys).
   `grant`    — buyurtma kodi yo'q bo'lsa, hisobga email orqali ruxsat beradi.
   `revokeUser` — faqat email orqali berilgan ruxsatni bekor qiladi.
   --------------------------------------------------------------------------
   Environment variable:
     ADMIN_SECRET — kamida 8 belgili maxfiy satr
   ========================================================================== */

import crypto from "node:crypto";
import { price } from "../lib/settings.mjs";
import { list, read, remove, write } from "../lib/store.mjs";
import {
  findByEmail,
  normalizeEmail,
  publicUser,
  validEmail
} from "../lib/users.mjs";

const ORDER_PREFIX = "orders/";
const ENTITLEMENT_PREFIX = "entitlements/";
const PAYME_PREFIX = "payme/";
const DAY = 24 * 60 * 60 * 1000;

function json(statusCode, body) {
  return {
    statusCode: statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

function safeEqual(a, b) {
  const bufferA = Buffer.from(String(a));
  const bufferB = Buffer.from(String(b));

  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

function authorized(secret) {
  const expected = String(process.env.ADMIN_SECRET || "");
  if (expected.length < 8) return false;

  return safeEqual(secret, expected);
}

/* Bir IP dan daqiqasiga 30 tadan ko'p urinish bo'lmasin. */
const hits = new Map();

function clientIp(event) {
  const headers = event.headers || {};
  const forwarded = headers["x-forwarded-for"] || headers["X-Forwarded-For"];
  const raw =
    headers["x-nf-client-connection-ip"] ||
    headers["client-ip"] ||
    forwarded ||
    "unknown";

  return String(raw).split(",")[0].trim() || "unknown";
}

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(function (time) {
    return now - time < 60000;
  });

  if (recent.length >= 30) {
    hits.set(ip, recent);
    return true;
  }

  recent.push(now);
  hits.set(ip, recent);
  return false;
}

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function manualStatus(order) {
  if (order.status === "paid") return "paid";
  if (order.status === "pending") return "pending";
  return "revoked";
}

function paymeStatus(tx) {
  if (tx.state === 2) return "paid";
  if (tx.state === 1) return "pending";
  return "revoked";
}

/*
 * Karta o'tkazmalari (`orders/`) va Payme tranzaksiyalari (`payme/`)
 * bitta ro'yxatga birlashtiriladi. Shunda admin panelda ikkala kanal ham
 * ko'rinadi, lekin Payme yozuvlari faqat o'qish uchun bo'ladi.
 */
async function allOrders() {
  const results = await Promise.all([
    list(ORDER_PREFIX),
    list(PAYME_PREFIX),
    list("users/")
  ]);

  const accounts = new Map();

  results[2].forEach(function (user) {
    if (user && user.id) accounts.set(String(user.id), user);
  });

  function accountFor(uid, order) {
    const user = accounts.get(uid) || {};

    return {
      name: String((order && order.name) || user.name || ""),
      email: String((order && order.email) || user.email || "")
    };
  }

  const manual = results[0]
    .filter(Boolean)
    .map(function (order) {
      const uid = String(order.uid || "");
      const account = accountFor(uid, order);

      return {
        code: String(order.code || ""),
        source: "manual",
        uid: uid,
        name: account.name,
        email: account.email,
        amount: Number(order.amount) || 0,
        status: manualStatus(order),
        createdAt: Number(order.createdAt) || 0,
        paidAt: Number(order.paidAt) || 0,
        revokedAt: Number(order.revokedAt) || 0
      };
    });

  const payme = results[1]
    .filter(Boolean)
    .map(function (tx) {
      const uid = String(tx.uid || "");
      const account = accountFor(uid);

      return {
        code: "PAYME-" + String(tx.id || ""),
        source: "payme",
        uid: uid,
        name: account.name,
        email: account.email,
        amount: Math.round((Number(tx.amount) || 0) / 100),
        status: paymeStatus(tx),
        createdAt: Number(tx.create_time) || 0,
        paidAt: Number(tx.perform_time) || 0,
        revokedAt: Number(tx.cancel_time) || 0,
        paymeId: String(tx.id || "")
      };
    });

  return manual.concat(payme).sort(function (a, b) {
    return b.createdAt - a.createdAt;
  });
}

function statsFor(orders) {
  const now = Date.now();
  const monthAgo = now - 30 * DAY;
  const paid = orders.filter(function (order) {
    return order.status === "paid";
  });
  const paid30 = paid.filter(function (order) {
    return order.paidAt >= monthAgo;
  });

  const users = new Set();
  paid.forEach(function (order) {
    if (order.uid) users.add(order.uid);
  });

  return {
    total: orders.length,
    pending: orders.filter(function (order) {
      return order.status === "pending";
    }).length,
    paid: paid.length,
    revoked: orders.filter(function (order) {
      return order.status === "revoked";
    }).length,
    revenue: paid.reduce(function (sum, order) {
      return sum + order.amount;
    }, 0),
    paid30: paid30.length,
    revenue30: paid30.reduce(function (sum, order) {
      return sum + order.amount;
    }, 0),
    users: users.size,
    generatedAt: now
  };
}

async function overview() {
  const orders = await allOrders();

  return json(200, {
    stats: statsFor(orders),
    orders: orders.slice(0, 500),
    truncated: orders.length > 500
  });
}

async function pendingOrders() {
  const all = await list(ORDER_PREFIX);

  return all
    .filter(function (order) {
      return order && order.status === "pending";
    })
    .sort(function (a, b) {
      return b.createdAt - a.createdAt;
    })
    .map(function (order) {
      return {
        code: order.code,
        amount: order.amount,
        createdAt: order.createdAt
      };
    });
}

async function hasOtherPaidOrder(uid, exceptCode) {
  const results = await Promise.all([list(ORDER_PREFIX), list(PAYME_PREFIX)]);

  const manual = results[0].some(function (order) {
    return (
      order &&
      order.uid === uid &&
      order.status === "paid" &&
      order.code !== exceptCode
    );
  });

  if (manual) return true;

  return results[1].some(function (tx) {
    return tx && tx.uid === uid && tx.state === 2;
  });
}

async function activate(code) {
  const order = await read(ORDER_PREFIX + code);

  if (!order) return json(404, { error: "Bunday kod topilmadi" });

  if (order.status === "paid") {
    return json(200, {
      ok: true,
      alreadyPaid: true,
      code: order.code,
      paidAt: order.paidAt
    });
  }

  /*
   * "revoked" holatidagi buyurtma ham qayta ochiladi. Avval xato bilan
   * bekor qilingan to'lovni tiklashning hech qanday yo'li yo'q edi.
   */
  if (order.status !== "pending" && order.status !== "revoked") {
    return json(409, { error: "Bu buyurtma yopilgan" });
  }

  const now = Date.now();
  const reopened = order.status === "revoked";

  await write(ENTITLEMENT_PREFIX + order.uid, {
    uid: order.uid,
    paidAt: now,
    code: order.code,
    amount: order.amount
  });

  await write(
    ORDER_PREFIX + order.code,
    Object.assign({}, order, {
      status: "paid",
      paidAt: now,
      revokedAt: 0,
      reactivatedAt: reopened ? now : order.reactivatedAt || 0
    })
  );

  return json(200, {
    ok: true,
    code: order.code,
    paidAt: now,
    reopened: reopened
  });
}

/* Buyurtma kodi yo'qolgan yoki karta o'tkazmasi kod yozilmasdan qilingan
   holatlar uchun hisobni email orqali qo'lda ochish. */
async function grantByEmail(email) {
  const normalized = normalizeEmail(email);

  if (!validEmail(normalized)) {
    return json(400, { error: "Email manzil noto'g'ri" });
  }

  const user = await findByEmail(normalized);

  if (!user) {
    return json(404, { error: "Bu email bilan hisob topilmadi" });
  }

  const existing = await read(ENTITLEMENT_PREFIX + user.id);

  if (existing) {
    return json(200, {
      ok: true,
      alreadyPaid: true,
      user: publicUser(user)
    });
  }

  const now = Date.now();

  await write(ENTITLEMENT_PREFIX + user.id, {
    uid: user.id,
    paidAt: now,
    code: "admin",
    amount: price()
  });

  return json(200, { ok: true, user: publicUser(user), paidAt: now });
}

async function hasAnyPaidSource(uid) {
  const results = await Promise.all([list(ORDER_PREFIX), list(PAYME_PREFIX)]);

  const manual = results[0].some(function (order) {
    return order && order.uid === uid && order.status === "paid";
  });

  if (manual) return true;

  return results[1].some(function (tx) {
    return tx && tx.uid === uid && tx.state === 2;
  });
}

/*
 * Faqat email orqali berilgan ruxsatni bekor qiladi. Agar hisobda to'langan
 * buyurtma yoki Payme tranzaksiyasi bo'lsa, avval o'sha kod bekor qilinishi
 * kerak — aks holda kirish huquqi va to'lov yozuvi bir-biriga zid bo'ladi.
 */
async function revokeByEmail(email) {
  const normalized = normalizeEmail(email);

  if (!validEmail(normalized)) {
    return json(400, { error: "Email manzil noto'g'ri" });
  }

  const user = await findByEmail(normalized);

  if (!user) {
    return json(404, { error: "Bu email bilan hisob topilmadi" });
  }

  const entitlement = await read(ENTITLEMENT_PREFIX + user.id);

  if (!entitlement) {
    return json(200, {
      ok: true,
      alreadyRevoked: true,
      user: publicUser(user)
    });
  }

  if (await hasAnyPaidSource(user.id)) {
    return json(409, {
      error:
        "Bu hisobda to'langan buyurtma bor. Avval buyurtma kodini bekor qiling."
    });
  }

  await remove(ENTITLEMENT_PREFIX + user.id);

  return json(200, { ok: true, user: publicUser(user) });
}

async function revoke(code) {
  const order = await read(ORDER_PREFIX + code);

  if (!order) return json(404, { error: "Bunday kod topilmadi" });

  if (order.status !== "paid") {
    return json(409, { error: "Bu buyurtma to'lanmagan" });
  }

  const stillPaid = await hasOtherPaidOrder(order.uid, order.code);

  if (!stillPaid) {
    await remove(ENTITLEMENT_PREFIX + order.uid);
  }

  await write(
    ORDER_PREFIX + order.code,
    Object.assign({}, order, {
      status: "revoked",
      revokedAt: Date.now()
    })
  );

  return json(200, { ok: true, code: order.code, stillPaid: stillPaid });
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Faqat POST so'rovlar qabul qilinadi" });
  }

  if (rateLimited(clientIp(event))) {
    return json(429, {
      error: "Juda ko'p urinish. Bir daqiqadan so'ng urinib ko'ring."
    });
  }

  let body;

  try {
    body = JSON.parse(event.body || "{}");
  } catch (error) {
    return json(400, { error: "So'rov noto'g'ri" });
  }

  if (!authorized(body.secret)) {
    return json(401, { error: "Maxfiy kalit noto'g'ri" });
  }

  switch (body.action) {
    case "overview":
      return overview();
    case "list":
      return json(200, { orders: await pendingOrders() });
    case "activate":
      return activate(normalizeCode(body.code));
    case "revoke":
      return revoke(normalizeCode(body.code));
    case "grant":
      return grantByEmail(body.email);
    case "revokeUser":
      return revokeByEmail(body.email);
    default:
      return json(400, { error: "Amal noto'g'ri" });
  }
}
