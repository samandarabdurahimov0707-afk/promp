/* ==========================================================================
   Admin uchun bo'laklab video yuklash.
   POST /api/video-upload
     { "secret": "...", "action": "init",   "filename": "...", "size": 123,
       "mime": "video/mp4", "chunkSize": 3145728 }
     { "secret": "...", "action": "chunk",  "uploadId": "...", "index": 0,
       "data": "<base64>" }
     { "secret": "...", "action": "finish", "uploadId": "..." }
     { "secret": "...", "action": "abort",  "uploadId": "..." }
   --------------------------------------------------------------------------
   Har bir so'rov ~4 MB (base64) — Netlify Functions'ning ~6 MB chegarasiga
   sig'adi. Fayl bo'laklari Blobs'da qoladi; ro'yxatga yozish alohida
   `/api/admin` → `saveVideos` orqali amalga oshiriladi.
   ========================================================================== */

import crypto from "node:crypto";
import {
  cleanupUploads,
  DEFAULT_CHUNK_SIZE,
  MAX_CHUNK_SIZE,
  MAX_VIDEO_BYTES,
  MIN_CHUNK_SIZE,
  chunkKey,
  readUpload,
  removeUpload,
  saveChunk,
  validId,
  validMime,
  writeUpload
} from "../lib/videos.mjs";
import { listKeys } from "../lib/store.mjs";

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

/* Faqat muvaffaqiyatsiz urinishlar sanaladi — yuklash sekinlashmaydi. */
const failures = new Map();

function clientIp(event) {
  const headers = event.headers || {};
  const raw =
    headers["x-nf-client-connection-ip"] ||
    headers["client-ip"] ||
    headers["x-forwarded-for"] ||
    "unknown";

  return String(raw).split(",")[0].trim() || "unknown";
}

function tooManyFailures(ip) {
  const now = Date.now();
  const recent = (failures.get(ip) || []).filter(function (time) {
    return now - time < 60000;
  });

  failures.set(ip, recent);
  return recent.length >= 20;
}

function recordFailure(ip) {
  const recent = failures.get(ip) || [];
  recent.push(Date.now());
  failures.set(ip, recent);
}

function text(value, max) {
  return String(value === undefined || value === null ? "" : value)
    .trim()
    .slice(0, max);
}

function uploadDescriptor(upload) {
  return {
    id: upload.uploadId,
    source: "upload",
    uploadId: upload.uploadId,
    size: upload.size,
    mime: upload.mime,
    chunkSize: upload.chunkSize,
    chunkCount: upload.chunkCount,
    createdAt: upload.createdAt
  };
}

async function init(body) {
  const size = Number(body.size);
  const mime = validMime(body.mime) ? String(body.mime) : "video/mp4";

  if (!Number.isInteger(size) || size < 1 || size > MAX_VIDEO_BYTES) {
    return json(400, {
      error: "Fayl hajmi noto'g'ri (maksimal 1 GB)"
    });
  }

  let chunkSize = Number(body.chunkSize) || DEFAULT_CHUNK_SIZE;
  if (!Number.isInteger(chunkSize)) chunkSize = DEFAULT_CHUNK_SIZE;
  chunkSize = Math.max(MIN_CHUNK_SIZE, Math.min(MAX_CHUNK_SIZE, chunkSize));

  const chunkCount = Math.ceil(size / chunkSize);

  if (chunkCount > 10000) {
    return json(400, { error: "Fayl juda katta" });
  }

  try {
    await cleanupUploads();
  } catch (error) {
    /* tozalash muvaffaqiyatsiz bo'lsa ham yuklashni to'xtatmaymiz */
  }

  const uploadId = crypto.randomUUID();
  const now = Date.now();

  await writeUpload(uploadId, {
    uploadId: uploadId,
    filename: text(body.filename, 200) || "video.mp4",
    size: size,
    mime: mime,
    chunkSize: chunkSize,
    chunkCount: chunkCount,
    status: "uploading",
    createdAt: now
  });

  return json(200, {
    ok: true,
    uploadId: uploadId,
    chunkSize: chunkSize,
    chunkCount: chunkCount,
    maxChunkBytes: chunkSize
  });
}

async function chunk(body) {
  const uploadId = String(body.uploadId || "");

  if (!validId(uploadId)) {
    return json(400, { error: "Yuklash ID noto'g'ri" });
  }

  const upload = await readUpload(uploadId);

  if (!upload) {
    return json(404, { error: "Yuklash sessiyasi topilmadi" });
  }

  if (upload.status !== "uploading") {
    return json(409, { error: "Bu yuklash allaqachon yakunlangan" });
  }

  const index = Number(body.index);

  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= Number(upload.chunkCount)
  ) {
    return json(400, { error: "Bo'lak raqami noto'g'ri" });
  }

  const expected =
    index === Number(upload.chunkCount) - 1
      ? Number(upload.size) - index * Number(upload.chunkSize)
      : Number(upload.chunkSize);

  const data = String(body.data || "");

  if (!data || data.length > Math.ceil(expected / 3) * 4 + 16) {
    return json(400, { error: "Bo'lak hajmi noto'g'ri" });
  }

  let buffer;

  try {
    buffer = Buffer.from(data, "base64");
  } catch (error) {
    return json(400, { error: "Bo'lak o'qilmadi" });
  }

  if (buffer.length !== expected) {
    return json(400, {
      error:
        "Bo'lak hajmi mos emas (" +
        buffer.length +
        " / " +
        expected +
        " bayt)"
    });
  }

  await saveChunk(uploadId, index, buffer);

  return json(200, {
    ok: true,
    index: index,
    received: buffer.length
  });
}

async function finish(body) {
  const uploadId = String(body.uploadId || "");

  if (!validId(uploadId)) {
    return json(400, { error: "Yuklash ID noto'g'ri" });
  }

  const upload = await readUpload(uploadId);

  if (!upload) {
    return json(404, { error: "Yuklash sessiyasi topilmadi" });
  }

  if (upload.status === "ready") {
    return json(200, { ok: true, video: uploadDescriptor(upload) });
  }

  const keys = await listKeys("videos/chunk/" + uploadId + "/");

  if (keys.length !== Number(upload.chunkCount)) {
    return json(409, {
      error: "Video to'liq yuklanmagan",
      received: keys.length,
      expected: Number(upload.chunkCount)
    });
  }

  /* Har bir bo'lak joyidami — nom bo'yicha tekshiramiz (baytlarni qayta
     o'qimaymiz, aks holda butun fayl xotiraga yig'ilardi). */
  for (let index = 0; index < Number(upload.chunkCount); index += 1) {
    if (keys.indexOf(chunkKey(uploadId, index)) === -1) {
      return json(409, {
        error: "Video bo'laklari to'liq emas",
        missing: index
      });
    }
  }

  const updated = Object.assign({}, upload, {
    status: "ready",
    readyAt: Date.now()
  });

  await writeUpload(uploadId, updated);

  return json(200, { ok: true, video: uploadDescriptor(updated) });
}

async function abort(body) {
  const uploadId = String(body.uploadId || "");

  if (!validId(uploadId)) {
    return json(400, { error: "Yuklash ID noto'g'ri" });
  }

  const upload = await readUpload(uploadId);
  await removeUpload(uploadId, upload ? upload.chunkCount : 0);

  return json(200, { ok: true });
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Faqat POST so'rovlar qabul qilinadi" });
  }

  const ip = clientIp(event);

  if (tooManyFailures(ip)) {
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
    recordFailure(ip);
    return json(401, { error: "Maxfiy kalit noto'g'ri" });
  }

  switch (body.action) {
    case "init":
      return init(body);
    case "chunk":
      return chunk(body);
    case "finish":
      return finish(body);
    case "abort":
      return abort(body);
    default:
      return json(400, { error: "Amal noto'g'ri" });
  }
}
