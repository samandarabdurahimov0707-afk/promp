/* ==========================================================================
   Ixtiyoriy: Bunny Stream uchun imzolangan video havolasi.
   GET /api/bunny-token?id=VIDEO_ID
   --------------------------------------------------------------------------
   Faqat to'lov qilgan foydalanuvchiga qisqa muddatli imzolangan havola
   qaytaradi. Shu bilan video faylni yashirish mumkin.

   Environment variables:
     BUNNY_LIBRARY_ID — Bunny Stream kutubxona ID
     BUNNY_TOKEN_KEY  — Bunny Stream token authentication kaliti
   ========================================================================== */

import crypto from "node:crypto";
import { read } from "../lib/store.mjs";
import {
  parseCookies,
  verifySession,
  verifyToken
} from "../lib/access.mjs";

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

export async function handler(event) {
  const params = event.queryStringParameters || {};
  const headers = event.headers || {};
  const videoId = String(params.id || "").trim();

  if (!/^[A-Za-z0-9-]{8,64}$/.test(videoId)) {
    return json(400, { error: "Video ID noto'g'ri" });
  }

  const cookies = parseCookies(headers.cookie || headers.Cookie || "");
  const sessionUid = verifySession(cookies.pk_session);
  let uid = sessionUid || verifyToken(cookies.pk_access);

  if (
    !uid &&
    !sessionUid &&
    /^[A-Za-z0-9_-]{8,64}$/.test(String(params.uid || ""))
  ) {
    uid = String(params.uid);
  }

  if (!uid) return json(401, { error: "Avtorizatsiya kerak" });

  const entitlement = await read("entitlements/" + uid);
  if (!entitlement) return json(403, { error: "To'lov talab qilinadi" });

  const libraryId = process.env.BUNNY_LIBRARY_ID;
  const tokenKey = process.env.BUNNY_TOKEN_KEY;

  if (!libraryId || !tokenKey) {
    return json(501, { error: "Bunny Stream sozlanmagan" });
  }

  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = crypto
    .createHash("sha256")
    .update(tokenKey + videoId + expires)
    .digest("hex");

  const url =
    "https://iframe.mediadelivery.net/embed/" +
    libraryId +
    "/" +
    videoId +
    "?token=" +
    token +
    "&expires=" +
    expires;

  return json(200, { url: url, expires: expires });
}
