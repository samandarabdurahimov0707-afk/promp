/* ==========================================================================
   Lokal dev server: statik fayllar + Netlify Functions.
   Ishlatish: npm run dev  (yoki: node scripts/serve.mjs)
   --------------------------------------------------------------------------
   Netlify CLI o'rnatilmagan bo'lsa ham /api/* funksiyalarini tekshirish uchun.
   `.env` fayli bo'lsa, o'zgaruvchilar shundan o'qiladi.
   ========================================================================== */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT) || 8123;
const host = process.env.HOST || "127.0.0.1";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".woff2": "font/woff2"
};

/* ------------------------------- .env ------------------------------------ */

function loadEnv() {
  const file = path.join(root, ".env");
  if (!fs.existsSync(file)) return;

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(match[1] in process.env)) process.env[match[1]] = value;
  }
}

loadEnv();

/* ------------------------------ Yordamchilar ---------------------------- */

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("content-length", Buffer.byteLength(payload));
  res.end(payload);
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    let data = "";
    let size = 0;

    req.on("data", function (chunk) {
      size += chunk.length;

      if (size > 1024 * 1024) {
        reject(new Error("So'rov hajmi juda katta"));
        req.destroy();
        return;
      }

      data += chunk;
    });

    req.on("end", function () {
      resolve(data);
    });

    req.on("error", reject);
  });
}

function serveFile(req, res, file, status) {
  let stat;

  try {
    stat = fs.statSync(file);
  } catch (error) {
    sendJson(res, 404, { error: "Fayl topilmadi" });
    return;
  }

  if (!stat.isFile()) {
    sendJson(res, 404, { error: "Fayl topilmadi" });
    return;
  }

  const type = mime[path.extname(file).toLowerCase()] || "application/octet-stream";
  const range = req.headers.range;

  res.setHeader("content-type", type);
  res.setHeader("accept-ranges", "bytes");
  res.setHeader("cache-control", "no-store");

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(range));

    if (match) {
      let start = match[1] ? parseInt(match[1], 10) : 0;
      let end = match[2] ? parseInt(match[2], 10) : stat.size - 1;

      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start > end ||
        start >= stat.size
      ) {
        res.statusCode = 416;
        res.setHeader("content-range", "bytes */" + stat.size);
        res.end();
        return;
      }

      end = Math.min(end, stat.size - 1);
      res.statusCode = 206;
      res.setHeader("content-range", "bytes " + start + "-" + end + "/" + stat.size);
      res.setHeader("content-length", String(end - start + 1));

      if (req.method === "HEAD") {
        res.end();
        return;
      }

      fs.createReadStream(file, { start: start, end: end }).pipe(res);
      return;
    }
  }

  res.statusCode = status || 200;
  res.setHeader("content-length", String(stat.size));

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  fs.createReadStream(file).pipe(res);
}

/* -------------------------------- API ------------------------------------ */

async function handleApi(req, res, pathname, url) {
  const name = pathname.slice("/api/".length);

  if (!/^[a-z0-9-]+$/.test(name)) {
    sendJson(res, 404, { error: "Funksiya topilmadi" });
    return;
  }

  const file = path.join(root, "netlify", "functions", name + ".mjs");

  if (!fs.existsSync(file)) {
    sendJson(res, 404, { error: "Funksiya topilmadi: " + name });
    return;
  }

  let body = null;

  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await readBody(req);
  }

  const event = {
    path: pathname,
    httpMethod: req.method,
    headers: req.headers,
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    body: body
  };

  try {
    const module = await import(pathToFileURL(file).href);
    const result = await module.handler(event);
    const headers = (result && result.headers) || {};
    const multiValueHeaders = (result && result.multiValueHeaders) || {};

    Object.keys(headers).forEach(function (key) {
      res.setHeader(key, headers[key]);
    });

    Object.keys(multiValueHeaders).forEach(function (key) {
      res.setHeader(key, multiValueHeaders[key]);
    });

    res.statusCode = (result && result.statusCode) || 200;

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    res.end(result && result.body !== undefined ? result.body : "");
  } catch (error) {
    console.error("[api:" + name + "]", error);
    sendJson(res, 500, {
      error: "Server xatosi",
      detail: String(error && error.message ? error.message : error)
    });
  }
}

/* ------------------------------- Server ---------------------------------- */

const server = http.createServer(function (req, res) {
  let url;

  try {
    url = new URL(req.url || "/", "http://" + (req.headers.host || "localhost"));
  } catch (error) {
    sendJson(res, 400, { error: "So'rov noto'g'ri" });
    return;
  }

  let pathname;

  try {
    pathname = decodeURIComponent(url.pathname);
  } catch (error) {
    sendJson(res, 400, { error: "Manzil noto'g'ri" });
    return;
  }

  if (pathname.indexOf("/api/") === 0) {
    handleApi(req, res, pathname, url)
      .catch(function (error) {
        console.error(error);
        if (!res.headersSent) sendJson(res, 500, { error: "Server xatosi" });
      })
      .then(function () {
        console.log(req.method + " " + pathname + " -> " + res.statusCode);
      });
    return;
  }

  if (pathname === "/") pathname = "/index.html";
  if (pathname.endsWith("/")) pathname += "index.html";

  let file = path.resolve(root, "." + pathname);

  if (file !== root && !file.startsWith(root + path.sep)) {
    sendJson(res, 403, { error: "Ruxsat yo'q" });
    return;
  }

  if (!fs.existsSync(file) && !path.extname(file)) {
    const html = file + ".html";
    if (fs.existsSync(html)) file = html;
  }

  if (!fs.existsSync(file)) {
    serveFile(req, res, path.join(root, "404.html"), 404);
    console.log(req.method + " " + pathname + " -> 404");
    return;
  }

  serveFile(req, res, file, 200);
  console.log(req.method + " " + pathname + " -> 200");
});

server.listen(port, host, function () {
  console.log("Prompt injenering kursi — dev server");
  console.log("http://" + host + ":" + port);
  console.log("API: http://" + host + ":" + port + "/api/health");

  /* Kalitlar bo'lmasa ro'yxatdan o'tish 503 qaytaradi — buni darhol
     ko'rsatib qo'yamiz, keyin sababini izlash kerak bo'lmaydi. */
  if (String(process.env.ACCESS_SECRET || "").length < 16) {
    console.warn(
      "OGOHLANTIRISH: ACCESS_SECRET yo'q yoki 16 belgidan qisqa. " +
        "Ro'yxatdan o'tish/kirish ishlamaydi (.env faylini to'ldiring)."
    );
  }

  if (String(process.env.ADMIN_SECRET || "").length < 16) {
    console.warn(
      "OGOHLANTIRISH: ADMIN_SECRET yo'q yoki 16 belgidan qisqa. " +
        "/admin.html ishlamaydi."
    );
  }
});

process.on("SIGINT", function () {
  server.close(function () {
    process.exit(0);
  });
});
