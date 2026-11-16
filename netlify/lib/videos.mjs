/* ==========================================================================
   Dars videolari uchun umumiy qatlam.
   --------------------------------------------------------------------------
   Video fayllar Netlify Blobs'da bo'laklarga (chunk) bo'lib saqlanadi:
     videos/list                 — darslar ro'yxati (tartiblangan massiv)
     videos/upload/{uploadId}    — yuklash sessiyasi metasi
     videos/chunk/{uploadId}/NNN — 3 MB li bo'laklar

   Bo'laklab yuklash Netlify Functions'ning ~6 MB so'rov chegarasiga mos
   keladi. O'qishda `/api/video` so'ralgan bayt oralig'ini bitta bo'lakdan
   qaytaradi — shuning uchun butun faylni xotiraga yig'ish shart emas.
   ========================================================================== */

import {
  listKeys,
  read,
  readBytes,
  remove,
  removeKeys,
  write,
  writeBytes
} from "./store.mjs";

export const LIST_KEY = "videos/list";
export const UPLOAD_PREFIX = "videos/upload/";
export const CHUNK_PREFIX = "videos/chunk/";

export const MAX_VIDEOS = 200;
export const MAX_VIDEO_BYTES = 1024 * 1024 * 1024; /* 1 GB */
export const MIN_CHUNK_SIZE = 256 * 1024; /* 256 KB */
export const DEFAULT_CHUNK_SIZE = 3 * 1024 * 1024; /* 3 MB */
export const MAX_CHUNK_SIZE = 4 * 1024 * 1024; /* 4 MB */
export const MAX_SLICE_BYTES = 3 * 1024 * 1024; /* javob chegarasi ~6 MB */

const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const MIME_PATTERN = /^(video\/[a-z0-9.+-]+|application\/octet-stream)$/i;

export function validId(value) {
  return typeof value === "string" && ID_PATTERN.test(value);
}

export function validMime(value) {
  return typeof value === "string" && MIME_PATTERN.test(value);
}

export function uploadKey(uploadId) {
  return UPLOAD_PREFIX + uploadId;
}

export function chunkKey(uploadId, index) {
  return (
    CHUNK_PREFIX +
    uploadId +
    "/" +
    String(index).padStart(5, "0")
  );
}

export async function readVideoList() {
  const value = await read(LIST_KEY);
  return Array.isArray(value) ? value : null;
}

export async function writeVideoList(list) {
  return write(LIST_KEY, list);
}

/* Ommaviy API uchun xavfsiz ko'rinish: uploadId va bo'lak sirlari chiqmaydi. */
export function publicVideo(video) {
  const result = {
    id: video.id,
    title: video.title,
    description: video.description || "",
    duration: video.duration || "",
    poster: video.poster || "",
    paid: Boolean(video.paid),
    source: video.source,
    size: Number(video.size) || 0,
    mime: video.mime || ""
  };

  if (video.source !== "upload") result.src = video.src || "";

  return result;
}

export async function readUpload(uploadId) {
  if (!validId(uploadId)) return null;

  const value = await read(uploadKey(uploadId));
  return value && typeof value === "object" ? value : null;
}

export async function writeUpload(uploadId, value) {
  return write(uploadKey(uploadId), value);
}

export async function saveChunk(uploadId, index, buffer) {
  return writeBytes(chunkKey(uploadId, index), buffer);
}

export async function readChunk(uploadId, index) {
  return readBytes(chunkKey(uploadId, index));
}

/* Yuklash sessiyasiga tegishli barcha bo'lak va metani o'chiradi. */
export async function removeUpload(uploadId, chunkCount) {
  if (!validId(uploadId)) return;

  const prefix = CHUNK_PREFIX + uploadId + "/";
  const keys = await listKeys(prefix);
  const expected = Math.max(0, Number(chunkCount) || 0);
  const all = keys.slice();

  for (let index = 0; index < expected; index += 1) {
    const key = chunkKey(uploadId, index);
    if (all.indexOf(key) === -1) all.push(key);
  }

  await removeKeys(all);
  await remove(uploadKey(uploadId));
}

/* Eski, tugallanmagan yuklashlarni tozalash (24 soatdan keyin). */
export async function cleanupUploads(maxAgeMs) {
  const limit = Number(maxAgeMs) || 24 * 60 * 60 * 1000;
  const now = Date.now();
  const keys = await listKeys(UPLOAD_PREFIX);

  if (!keys.length) return 0;

  const list = (await readVideoList()) || [];
  const used = new Set();

  list.forEach(function (video) {
    if (video && video.uploadId) used.add(String(video.uploadId));
  });

  let removed = 0;

  for (const key of keys.slice(0, 10)) {
    const meta = await read(key);
    if (!meta || used.has(String(meta.uploadId || ""))) continue;
    if (now - Number(meta.createdAt || 0) < limit) continue;

    await removeUpload(String(meta.uploadId || ""), meta.chunkCount);
    removed += 1;
  }

  return removed;
}

/*
 * `Range: bytes=...` sarlavhasini o'qiydi.
 * Natija: { start, end, partial } yoki noto'g'ri bo'lsa null.
 */
export function parseRange(header, size) {
  const total = Math.max(0, Number(size) || 0);
  if (!total) return null;

  const raw = String(header || "").trim();

  if (!raw) return { start: 0, end: total - 1, partial: false };

  const match = /^bytes=(\d*)-(\d*)$/.exec(raw);
  if (!match) return null;
  if (match[1] === "" && match[2] === "") return null;

  let start;
  let end;

  if (match[1] === "") {
    const suffix = parseInt(match[2], 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;

    start = Math.max(0, total - suffix);
    end = total - 1;
  } else {
    start = parseInt(match[1], 10);
    end = match[2] === "" ? total - 1 : parseInt(match[2], 10);
  }

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    start > end ||
    start >= total
  ) {
    return null;
  }

  return { start, end: Math.min(end, total - 1), partial: true };
}
