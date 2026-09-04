/* Bumper CACHE_NAME à CHAQUE déploiement, sinon le téléphone
   garde l'ancienne version en cache. */
const CACHE_NAME = "reps-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css?v=2",
  "./js/motion.js?v=2",
  "./js/data.js?v=2",
  "./js/chart.js?v=2",
  "./js/session.js?v=2",
  "./js/views.js?v=2",
  "./js/app.js?v=2",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-180.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
