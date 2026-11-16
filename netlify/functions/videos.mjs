/* ==========================================================================
   Ommaviy darslar ro'yxati.
   GET /api/videos
   --------------------------------------------------------------------------
   `configured: true` bo'lsa, admin panelda saqlangan ro'yxat mavjud va u
   saytdagi <video> teglaridan ustun turadi (bo'sh ro'yxat ham haqiqiy).
   `configured: false` bo'lsa, sayt eski <video> teglariga qaytadi.
   ========================================================================== */

import { publicVideo, readVideoList } from "../lib/videos.mjs";

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

export async function handler(event) {
  const method = event.httpMethod || "GET";

  if (method !== "GET" && method !== "HEAD") {
    return json(405, { error: "Faqat GET so'rovlar qabul qilinadi" });
  }

  const list = await readVideoList();

  return json(200, {
    configured: list !== null,
    videos: list ? list.map(publicVideo) : []
  });
}
