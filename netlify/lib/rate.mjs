/* ==========================================================================
   IP bo'yicha oddiy so'rov cheklovi.
   Serverless muhitda har bir instansiya o'z xotirasiga ega.
   ========================================================================== */

export function clientIp(event) {
  const headers = (event && event.headers) || {};
  const forwarded = headers["x-forwarded-for"] || headers["X-Forwarded-For"];
  const raw =
    headers["x-nf-client-connection-ip"] ||
    headers["client-ip"] ||
    forwarded ||
    "unknown";

  return String(raw).split(",")[0].trim() || "unknown";
}

export function createLimiter(limit, windowMs) {
  const hits = new Map();

  return function limited(event) {
    const ip = clientIp(event);
    const now = Date.now();
    const recent = (hits.get(ip) || []).filter(function (time) {
      return now - time < windowMs;
    });

    if (recent.length >= limit) {
      hits.set(ip, recent);
      return true;
    }

    recent.push(now);
    hits.set(ip, recent);
    return false;
  };
}
