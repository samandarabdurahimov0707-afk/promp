/* ==========================================================================
   Karta o'tkazmasi uchun buyurtma (order) yaratadi.
   POST /api/order   { "uid": "..." }
   --------------------------------------------------------------------------
   Javob: { code, amount, createdAt }
   `code` — foydalanuvchi to'lov izohida yozadigan qisqa kod. Kurs egasi
   shu kod orqali /admin.html sahifasida darslarni ochadi.
   ========================================================================== */

import crypto from "node:crypto";
import { currentUser } from "../lib/auth.mjs";
import { read, write } from "../lib/store.mjs";
import { price } from "../lib/settings.mjs";

const ORDER_PREFIX = "orders/";
const UID_INDEX_PREFIX = "order-by-uid/";
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

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

function validUid(uid) {
  return /^[A-Za-z0-9_-]{8,64}$/.test(uid);
}

function newCode() {
  let out = "";

  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }

  return out;
}

async function uniqueCode() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = newCode();
    const existing = await read(ORDER_PREFIX + code);
    if (!existing) return code;
  }

  throw new Error("Bo'sh kod topilmadi");
}

/* Bir IP dan daqiqasiga 15 tadan ko'p buyurtma yaratilmasin. */
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

  if (recent.length >= 15) {
    hits.set(ip, recent);
    return true;
  }

  recent.push(now);
  hits.set(ip, recent);
  return false;
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Faqat POST so'rovlar qabul qilinadi" });
  }

  let body;

  try {
    body = JSON.parse(event.body || "{}");
  } catch (error) {
    return json(400, { error: "So'rov noto'g'ri" });
  }

  /*
   * Tizimga kirgan bo'lsa, buyurtma hisobga bog'lanadi. Brauzerdan kelgan
   * uid faqat mehmon foydalanuvchilar uchun ishlatiladi.
   */
  const user = await currentUser(event);
  const uid = user ? user.id : String(body.uid || "").trim();

  if (!validUid(uid)) {
    return json(400, { error: "Foydalanuvchi identifikatori noto'g'ri" });
  }

  if (rateLimited(clientIp(event))) {
    return json(429, { error: "Juda ko'p so'rov. Bir daqiqadan so'ng urinib ko'ring." });
  }

  const existingCode = await read(UID_INDEX_PREFIX + uid);

  if (existingCode) {
    const existing = await read(ORDER_PREFIX + existingCode);

    if (existing && existing.status === "pending") {
      if (user && !existing.email) {
        await write(
          ORDER_PREFIX + existing.code,
          Object.assign({}, existing, { name: user.name, email: user.email })
        );
      }

      return json(200, {
        code: existing.code,
        amount: existing.amount,
        createdAt: existing.createdAt
      });
    }
  }

  const code = await uniqueCode();
  const now = Date.now();

  const order = {
    code: code,
    uid: uid,
    name: user ? user.name : "",
    email: user ? user.email : "",
    amount: price(),
    createdAt: now,
    status: "pending",
    paidAt: 0
  };

  await write(ORDER_PREFIX + code, order);
  await write(UID_INDEX_PREFIX + uid, code);

  return json(200, { code: code, amount: order.amount, createdAt: now });
}
