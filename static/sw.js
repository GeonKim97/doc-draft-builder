const CACHE_NAME = "usw-doc-draft-v1";
const STATIC_ASSETS = [
  "/static/css/style.css",
  "/static/js/app.js",
  "/static/manifest.json",
  "/static/img/suwon_logo.png",
  "/static/img/icon-180.png",
  "/static/img/icon-192.png",
  "/static/img/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((oldKey) => caches.delete(oldKey))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API 요청 및 POST 요청은 항상 네트워크로 처리합니다.
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/")) {
    return;
  }

  // 정적 파일은 캐시 우선, 페이지(HTML)는 네트워크 우선으로 처리합니다.
  if (url.pathname.startsWith("/static/")) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) => cached || fetch(event.request)
      )
    );
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
