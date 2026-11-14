/* ==========================================================================
   Foydalanuvchi hisobi: ro'yxatdan o'tish, kirish, chiqish.
   --------------------------------------------------------------------------
   GET  /api/auth                     — joriy hisob va to'lov holati
   POST /api/auth { action: "register", name, email, password, guestUid }
   POST /api/auth { action: "login", email, password, guestUid }
   POST /api/auth { action: "logout" }

   Parollar scrypt bilan xeshlanadi. Sessiya ACCESS_SECRET bilan imzolangan
   HttpOnly cookie (`pk_session`) orqali saqlanadi.
   ========================================================================== */

import {
  clearAccessCookie,
  clearSessionCookie,
  hasSecret,
  isSecureRequest,
  sessionCookie
} from "../lib/access.mjs";
import { telegram } from "../lib/settings.mjs";
import { currentAccount } from "../lib/auth.mjs";
import { mergeGuest } from "../lib/merge.mjs";
import { createLimiter } from "../lib/rate.mjs";
import { read } from "../lib/store.mjs";
import {
  authenticate,
  createUser,
  normalizeEmail,
  publicUser,
  validEmail,
  validName,
  validPassword
} from "../lib/users.mjs";

const limit = createLimiter(20, 60000);

function json(statusCode, body, headers, multiValueHeaders) {
  const response = {
    statusCode: statusCode,
    headers: Object.assign(
      {
        "content-type": "application/json",
        "cache-control": "no-store"
      },
      headers || {}
    ),
    body: JSON.stringify(body)
  };

  if (multiValueHeaders) response.multiValueHeaders = multiValueHeaders;

  return response;
}

function account(user, paid) {
  return {
    ok: true,
    user: publicUser(user),
    paid: Boolean(paid)
  };
}

async function entitlementFor(userId) {
  return read("entitlements/" + userId);
}

/*
 * ACCESS_SECRET yo'q bo'lsa hisob tizimi ishlamaydi. Foydalanuvchiga
 * texnik sababni emas, nima qilish kerakligini ko'rsatamiz.
 */
function notConfigured() {
  return json(503, {
    error:
      "Hisob tizimi hozircha sozlanmagan. Kurs egasiga murojaat qiling: @" +
      telegram()
  });
}

function parseBody(event) {
  try {
    return JSON.parse(event.body || "{}");
  } catch (error) {
    return null;
  }
}

async function register(event, body) {
  const name = String(body.name || "").trim();
  const email = normalizeEmail(body.email);
  const password = body.password;

  if (!validName(name)) {
    return json(400, { error: "Ism kamida 2 ta belgidan iborat bo'lishi kerak." });
  }

  if (!validEmail(email)) {
    return json(400, { error: "Email manzil noto'g'ri." });
  }

  if (!validPassword(password)) {
    return json(400, { error: "Parol kamida 8 ta belgidan iborat bo'lishi kerak." });
  }

  const created = await createUser({ name: name, email: email, password: password });

  if (created.error === "exists") {
    return json(409, { error: "Bu email allaqachon ro'yxatdan o'tgan. Kirish bo'limidan foydalaning." });
  }

  const user = created.user;
  const merge = await mergeGuest(body.guestUid, user.id);
  const paid = merge.paid || Boolean(await entitlementFor(user.id));
  const cookie = sessionCookie(user.id, isSecureRequest(event));

  if (!cookie) return notConfigured();

  return json(200, account(user, paid), { "set-cookie": cookie });
}

async function login(event, body) {
  const email = normalizeEmail(body.email);
  const password = body.password;

  if (!validEmail(email)) {
    return json(400, { error: "Email manzil noto'g'ri." });
  }

  if (typeof password !== "string" || !password) {
    return json(400, { error: "Parolni kiriting." });
  }

  const user = await authenticate(email, password);

  if (!user) {
    return json(401, { error: "Email yoki parol noto'g'ri." });
  }

  const merge = await mergeGuest(body.guestUid, user.id);
  const paid = merge.paid || Boolean(await entitlementFor(user.id));
  const cookie = sessionCookie(user.id, isSecureRequest(event));

  if (!cookie) return notConfigured();

  return json(200, account(user, paid), { "set-cookie": cookie });
}

export async function handler(event) {
  const method = event.httpMethod || "GET";

  if (method === "GET" || method === "HEAD") {
    const result = await currentAccount(event);
    return json(200, {
      ok: true,
      user: result.user,
      paid: result.paid
    });
  }

  if (method !== "POST") {
    return json(405, { error: "Faqat GET va POST so'rovlar qabul qilinadi." });
  }

  if (limit(event)) {
    return json(429, {
      error: "Juda ko'p urinish. Bir daqiqadan so'ng qayta urinib ko'ring."
    });
  }

  const body = parseBody(event);

  if (!body) {
    return json(400, { error: "So'rov noto'g'ri." });
  }

  if (body.action === "logout") {
    const secure = isSecureRequest(event);

    /*
     * Sessiya bilan birga eski kirish cookie'si ham o'chiriladi. Aks holda
     * tizimdan chiqqan foydalanuvchi brauzerida qolgan `pk_access` tokeni
     * orqali yopiq darslarni ochishda davom etishi mumkin edi.
     */
    return json(
      200,
      { ok: true, user: null, paid: false },
      {},
      {
        "Set-Cookie": [
          clearSessionCookie(secure),
          clearAccessCookie(secure)
        ]
      }
    );
  }

  if (!hasSecret()) {
    return notConfigured();
  }

  if (body.action === "register") return register(event, body);
  if (body.action === "login") return login(event, body);

  return json(400, { error: "Amal noto'g'ri." });
}
