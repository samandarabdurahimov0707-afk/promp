/* ==========================================================================
   Kirish huquqi uchun imzolangan token va cookie yordamchilari.
   ========================================================================== */

import crypto from "node:crypto";

const SESSION_PREFIX = "session:";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

/*
 * Maxfiy kalit bo'lmasa yoki juda qisqa bo'lsa, token umuman yaratilmaydi
 * (fail closed). Shu bilan ACCESS_SECRET unutilib qolsa ham hech kim
 * imzoni soxtalashtira olmaydi.
 */
function secret() {
  const value = String(process.env.ACCESS_SECRET || "");
  return value.length >= 16 ? value : "";
}

export function hasSecret() {
  return Boolean(secret());
}

export function signToken(uid) {
  const key = secret();
  if (!key) return null;

  const signature = crypto
    .createHmac("sha256", key)
    .update(String(uid))
    .digest("hex");

  return uid + "." + signature;
}

export function verifyToken(token) {
  if (!token) return null;

  const key = secret();
  if (!key) return null;

  const value = String(token);
  const index = value.lastIndexOf(".");
  if (index < 1) return null;

  const uid = value.slice(0, index);
  const signature = value.slice(index + 1);

  /* Imzo aynan 64 ta hex belgidan iborat bo'lishi shart. Aks holda
     `Buffer.from(..., "hex")` oxiridagi noto'g'ri belgilarni jimgina
     tashlab yuboradi va token o'zgartirilgan bo'lsa ham o'tib ketadi. */
  if (!/^[0-9a-f]{64}$/.test(signature)) return null;

  const expected = crypto
    .createHmac("sha256", key)
    .update(uid)
    .digest("hex");

  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");

  if (a.length === 0 || a.length !== b.length) return null;

  return crypto.timingSafeEqual(a, b) ? uid : null;
}

export function parseCookies(header) {
  const out = {};

  String(header || "")
    .split(";")
    .forEach(function (part) {
      const index = part.indexOf("=");
      if (index < 0) return;

      const name = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();

      if (!name) return;

      try {
        out[name] = decodeURIComponent(value);
      } catch (error) {
        out[name] = value;
      }
    });

  return out;
}

/* Sessiya tokeni `session:<user-id>` ko'rinishida imzolanadi. Shu bilan
   `pk_access` tokenidan ajralib turadi va ularni almashtirib bo'lmaydi. */
export function signSession(userId) {
  const value = String(userId || "").trim();

  if (!/^[A-Za-z0-9_-]{8,64}$/.test(value)) return null;

  return signToken(SESSION_PREFIX + value);
}

export function verifySession(token) {
  const value = verifyToken(token);

  if (!value || value.indexOf(SESSION_PREFIX) !== 0) return null;

  const userId = value.slice(SESSION_PREFIX.length);

  return /^[A-Za-z0-9_-]{8,64}$/.test(userId) ? userId : null;
}

export function sessionCookie(userId, secure) {
  const token = signSession(userId);
  if (!token) return null;

  const parts = [
    "pk_session=" + token,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=" + SESSION_MAX_AGE
  ];

  if (secure) parts.push("Secure");

  return parts.join("; ");
}

export function clearSessionCookie(secure) {
  const parts = [
    "pk_session=",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0"
  ];

  if (secure) parts.push("Secure");

  return parts.join("; ");
}

export function clearAccessCookie(secure) {
  const parts = [
    "pk_access=",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0"
  ];

  if (secure) parts.push("Secure");

  return parts.join("; ");
}

export function accessCookie(uid, secure) {
  const token = signToken(uid);
  if (!token) return null;

  const parts = [
    "pk_access=" + token,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=31536000"
  ];

  if (secure) parts.push("Secure");

  return parts.join("; ");
}

export function isSecureRequest(event) {
  const headers = event.headers || {};
  const proto = headers["x-forwarded-proto"] || headers["X-Forwarded-Proto"] || "";
  return String(proto).split(",")[0].trim() === "https";
}
