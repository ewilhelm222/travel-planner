const CACHE = "waypoint-shell-v1";
const ASSETS = ["/offline.html", "/planner.js", "/planner.css", "/favicon.svg"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("waypoint-shell-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;
  // Never cache APIs, sign-in/out responses, identity, or authenticated HTML.
  if (event.request.mode === "navigate" && (url.pathname === "/" || url.pathname === "/offline.html")) {
    event.respondWith(fetch(event.request).catch(() => caches.match("/offline.html").then(r => r || Response.error())));
  } else if (ASSETS.includes(url.pathname)) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then(r => r || Response.error())));
  }
});
