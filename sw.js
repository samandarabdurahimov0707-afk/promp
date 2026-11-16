/* ==========================================================================
   Service worker — Prompt injenering kursi
   --------------------------------------------------------------------------
   - HTML: network-first (yangilik darhol ko'rinadi), offline'da kesh.
   - CSS/JS/rasm: cache-first, fonda yangilanadi.
   - /api/* va /videos/* hech qachon keshlanmaydi.
   ========================================================================== */

const CACHE = "prompt-kursi-v5";
const SHELL = [
  "/",
  "/index.html",
  "/offline.html",
  "/css/style.css?v=5",
  "/js/config.js?v=5",
  "/js/common.js?v=5",
  "/js/app.js?v=5",
  "/img/icon.svg",
  "/img/icon-192.png",
  "/img/icon-512.png",
  "/manifest.webmanifest"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(function (cache) {
        return cache.addAll(SHELL);
      })
      .then(function () {
        return self.skipWaiting();
      })
      .catch(function () {
        /* bitta fayl yuklanmasa ham o'rnatishni to'xtatmaymiz */
      })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              return key !== CACHE;
            })
            .map(function (key) {
              return caches.delete(key);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

function isCacheable(request) {
  if (request.method !== "GET") return false;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.indexOf("/api/") === 0) return false;
  if (url.pathname.indexOf("/videos/") === 0) return false;
  if (request.headers.has("range")) return false;

  return true;
}

self.addEventListener("fetch", function (event) {
  const request = event.request;

  if (!isCacheable(request)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(function (response) {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(function (cache) {
              cache.put("/index.html", copy);
            });
          }
          return response;
        })
        .catch(function () {
          return caches.match("/index.html").then(function (cached) {
            return cached || caches.match("/offline.html");
          });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) {
        fetch(request)
          .then(function (response) {
            if (response && response.ok && response.type === "basic") {
              caches.open(CACHE).then(function (cache) {
                cache.put(request, response.clone());
              });
            }
          })
          .catch(function () {
            /* offline — keshdagi nusxa ishlatiladi */
          });

        return cached;
      }

      return fetch(request)
        .then(function (response) {
          if (response && response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then(function (cache) {
              cache.put(request, copy);
            });
          }
          return response;
        })
        .catch(function () {
          return caches.match("/offline.html");
        });
    })
  );
});
