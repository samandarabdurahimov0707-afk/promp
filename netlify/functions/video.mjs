/* ==========================================================================
   Video oqimi (Range bilan).
   GET /api/video?id=VIDEO_ID
   --------------------------------------------------------------------------
   Fayl Netlify Blobs'da 3 MB li bo'laklarda saqlanadi. So'ralgan bayt
   oralig'i bitta bo'lakdan kesib qaytariladi (javob chegarasi ~6 MB).
   Brauzer keyingi bo'lakni o'zi so'raydi — shuning uchun butun fayl
   xotiraga yig'ilmaydi.

   Pullik darslar uchun imzolangan `pk_access` cookie yoki `pk_session`
   tekshiriladi. Huquq `entitlements/{uid}` yozuvidan olinadi.
   ========================================================================== */

import { read } from "../lib/store.mjs";
import { parseCookies, verifySession, verifyToken } from "../lib/access.mjs";
import {
  DEFAULT_CHUNK_SIZE,
  MAX_SLICE_BYTES,
  parseRange,
  readChunk,
  readVideoList,
  validId
} from "../lib/videos.mjs";

function header(event, name) {
  const headers = event.headers || {};
  const lower = name.toLowerCase();

  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) return headers[key];
  }

  return "";
}

function json(statusCode, body) {
  return {
    statusCode: statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    },
    body: JSON.stringify(body)
  };
}

async function hasPaidAccess(event) {
  const cookies = parseCookies(header(event, "cookie"));
  const uid = verifySession(cookies.pk_session) || verifyToken(cookies.pk_access);

  if (!uid) return false;

  const entitlement = await read("entitlements/" + uid);
  return Boolean(entitlement);
}

export async function handler(event) {
  const method = event.httpMethod || "GET";

  if (method !== "GET" && method !== "HEAD") {
    return json(405, { error: "Faqat GET so'rovlar qabul qilinadi" });
  }

  const params = event.queryStringParameters || {};
  const id = String(params.id || "").trim();

  if (!validId(id)) {
    return json(400, { error: "Video ID noto'g'ri" });
  }

  const list = await readVideoList();

  if (!list) {
    return json(404, { error: "Video topilmadi" });
  }

  const video = list.find(function (item) {
    return item && item.id === id;
  });

  if (!video || video.source !== "upload") {
    return json(404, { error: "Video topilmadi" });
  }

  if (video.paid && !(await hasPaidAccess(event))) {
    return json(403, { error: "Bu dars pullik. To'lovni tasdiqlang." });
  }

  const size = Number(video.size) || 0;
  const range = parseRange(header(event, "range"), size);

  if (!range) {
    return {
      statusCode: 416,
      headers: {
        "content-range": "bytes */" + String(size),
        "accept-ranges": "bytes",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      },
      body: ""
    };
  }

  const chunkSize = Number(video.chunkSize) || DEFAULT_CHUNK_SIZE;
  const index = Math.floor(range.start / chunkSize);
  const offset = range.start - index * chunkSize;
  const buffer = await readChunk(video.uploadId, index);

  if (!buffer || offset >= buffer.length) {
    return json(404, { error: "Video bo'lagi topilmadi" });
  }

  const available = buffer.length - offset;
  const wanted = range.end - range.start + 1;
  const length = Math.max(1, Math.min(wanted, available, MAX_SLICE_BYTES));
  const slice = buffer.subarray(offset, offset + length);
  const last = range.start + length - 1;

  const headers = {
    "content-type": video.mime || "video/mp4",
    "content-length": String(slice.length),
    "content-range":
      "bytes " + range.start + "-" + last + "/" + String(size),
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=3600",
    "x-content-type-options": "nosniff"
  };

  if (method === "HEAD") {
    return { statusCode: 206, headers: headers, body: "" };
  }

  return {
    statusCode: 206,
    headers: headers,
    body: slice.toString("base64"),
    isBase64Encoded: true
  };
}
