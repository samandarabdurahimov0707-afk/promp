/* ==========================================================================
   Loyihani tekshirish: sintaksis, JSON va majburiy fayllar.
   Ishlatish: npm run check
   ========================================================================== */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skipDirs = new Set([
  "node_modules",
  ".git",
  ".netlify",
  ".idea",
  "videos"
]);
const extensions = new Set([".js", ".mjs"]);
const files = [];
const failures = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) walk(full);
      continue;
    }

    if (extensions.has(path.extname(entry.name))) files.push(full);
  }
}

walk(root);

for (const file of files) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (error) {
    const details = error.stderr ? error.stderr.toString() : error.message;
    failures.push(path.relative(root, file) + "\n" + details.trim());
  }
}

for (const relative of ["package.json", "manifest.webmanifest"]) {
  const file = path.join(root, relative);

  try {
    JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    failures.push(relative + ": JSON xatosi — " + error.message);
  }
}

const required = [
  "index.html",
  "admin.html",
  "404.html",
  "offline.html",
  "shartlar.html",
  "maxfiylik.html",
  "css/style.css",
  "css/admin.css",
  "js/config.js",
  "js/common.js",
  "js/app.js",
  "js/admin.js",
  "manifest.webmanifest",
  "sw.js",
  "robots.txt",
  "sitemap.xml",
  "netlify.toml",
  "img/icon.svg",
  "img/icon-192.png",
  "img/icon-512.png",
  "img/icon-maskable-512.png",
  "img/apple-touch-icon.png",
  "img/og.png",
  "img/poster-intro.svg",
  "img/poster-ai.svg",
  "netlify/functions/payme.mjs",
  "netlify/functions/order.mjs",
  "netlify/functions/admin.mjs",
  "netlify/functions/access.mjs",
  "netlify/functions/auth.mjs",
  "netlify/functions/config.mjs",
  "netlify/functions/health.mjs",
  "netlify/functions/bunny-token.mjs",
  "netlify/lib/access.mjs",
  "netlify/lib/auth.mjs",
  "netlify/lib/merge.mjs",
  "netlify/lib/rate.mjs",
  "netlify/lib/settings.mjs",
  "netlify/lib/store.mjs",
  "netlify/lib/users.mjs"
];

for (const relative of required) {
  if (!fs.existsSync(path.join(root, relative))) {
    failures.push("Yetishmayotgan fayl: " + relative);
  }
}

const netlify = fs.readFileSync(path.join(root, "netlify.toml"), "utf8");

if (!netlify.includes("Content-Security-Policy")) {
  failures.push("netlify.toml: Content-Security-Policy topilmadi");
}

const admin = fs.readFileSync(path.join(root, "admin.html"), "utf8");

if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(admin)) {
  failures.push("admin.html: inline <script> topildi (CSP uchun taqiqlangan)");
}

if (/<style[\s>]/i.test(admin)) {
  failures.push("admin.html: inline <style> topildi (CSP uchun taqiqlangan)");
}

if (failures.length) {
  console.error("Tekshiruvda xatolar topildi:\n");
  failures.forEach(function (item) {
    console.error(" - " + item + "\n");
  });
  process.exit(1);
}

console.log(
  "Tekshirildi: " +
    files.length +
    " ta JS fayl, " +
    required.length +
    " ta majburiy fayl."
);
console.log("Hammasi joyida ✓");
