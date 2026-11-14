/* ==========================================================================
   Sayt va to'lov tizimining holati.
   GET /api/health
   --------------------------------------------------------------------------
   Maxfiy qiymatlar qaytarilmaydi — faqat "bor/yo'q" holati. Monitoring va
   deploydan keyingi tekshiruv uchun ishlatiladi.
   ========================================================================== */

function bool(value) {
  return Boolean(value);
}

export async function handler(event) {
  if (event.httpMethod !== "GET" && event.httpMethod !== "HEAD") {
    return {
      statusCode: 405,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        allow: "GET, HEAD"
      },
      body: JSON.stringify({ error: "Faqat GET so'rovlar qabul qilinadi" })
    };
  }

  const checks = {
    adminSecret: String(process.env.ADMIN_SECRET || "").length >= 16,
    accessSecret: String(process.env.ACCESS_SECRET || "").length >= 16,
    paymeMerchantId: bool(String(process.env.PAYME_MERCHANT_ID || "").trim()),
    paymeKey: String(process.env.PAYME_KEY || "").length >= 8,
    telegram: bool(String(process.env.PAYMENT_TELEGRAM || "").trim()),
    blobs: bool(process.env.NETLIFY_BLOBS_CONTEXT)
  };

  const ok =
    checks.adminSecret &&
    checks.accessSecret &&
    checks.paymeMerchantId &&
    checks.paymeKey;

  return {
    statusCode: ok ? 200 : 503,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store"
    },
    body: JSON.stringify({
      ok: ok,
      status: ok ? "ok" : "degraded",
      service: "prompt-kursi",
      version: "1.0.0",
      time: new Date().toISOString(),
      checks: checks
    })
  };
}
