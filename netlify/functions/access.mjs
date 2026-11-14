/* ==========================================================================
   Foydalanuvchining to'lov holatini tekshiradi.
   GET /api/access?uid=...
   To'lov bo'lsa — imzolangan HttpOnly cookie o'rnatadi va { paid: true }.
   ========================================================================== */

import { read } from "../lib/store.mjs";
import {
  accessCookie,
  isSecureRequest,
  parseCookies,
  verifySession,
  verifyToken
} from "../lib/access.mjs";

function json(body, headers) {
  return {
    statusCode: 200,
    headers: Object.assign(
      {
        "content-type": "application/json",
        "cache-control": "no-store"
      },
      headers || {}
    ),
    body: JSON.stringify(body)
  };
}

export async function handler(event) {
  const params = event.queryStringParameters || {};
  const headers = event.headers || {};
  const queryUid = String(params.uid || "").trim();

  const cookies = parseCookies(headers.cookie || headers.Cookie || "");
  const sessionUid = verifySession(cookies.pk_session);
  const cookieUid = verifyToken(cookies.pk_access);
  const guestUid = /^[A-Za-z0-9_-]{8,64}$/.test(queryUid) ? queryUid : cookieUid;

  /*
   * Tizimga kirgan foydalanuvchi uchun hisob identifikatori ustuvor.
   * Mehmon uid'i faqat sessiya bo'lmaganda ishlatiladi.
   */
  const uid = sessionUid || guestUid;

  if (!uid) return json({ paid: false });

  const entitlement = await read("entitlements/" + uid);

  if (!entitlement) return json({ paid: false });

  const cookie = accessCookie(uid, isSecureRequest(event));

  return json(
    { paid: true, uid: uid },
    cookie ? { "set-cookie": cookie } : {}
  );
}
