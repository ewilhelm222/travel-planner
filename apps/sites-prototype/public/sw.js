const CACHE = "waypoint-shell-v15";
const ASSETS = ["/offline.html", "/planner.js", "/planner.css", "/favicon.svg", "/reading-copy.mjs", "/offline-export.mjs", "/board.mjs", "/participants.mjs", "/move.mjs", "/drag.mjs"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(async cache => {
    // Do not replace working offline scripts with HTML sign-in responses.
    const responses = await Promise.all(ASSETS.map(path => fetch(path, { cache: "reload" })));
    const valid = await Promise.all(responses.map((response, index) => validAsset(ASSETS[index], response)));
    const failed = responses.flatMap((response, index) => valid[index] ? [] : [{ path: ASSETS[index], status: response.status, type: response.headers.get("Content-Type"), redirected: response.redirected }]);
    if (failed.length) {
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      clients.forEach(client => client.postMessage({ type: "waypoint-offline-failed", assets: failed }));
      throw new Error("Offline assets unavailable; keeping the previous offline version.");
    }
    await Promise.all(responses.map((response, index) => cache.put(ASSETS[index], response)));
  }).then(() => self.skipWaiting()));
});
async function validAsset(path, response) {
  if (!response.ok) return false;
  const type = response.headers.get("Content-Type") || "";
  if (path.endsWith(".html")) {
    // Cloudflare normally canonicalizes /offline.html to /offline. Accept
    // that exact same-origin redirect and verify the shell, never a login page.
    const finalUrl = new URL(response.url || path, self.location.origin);
    if (finalUrl.origin !== self.location.origin || ![path, path.replace(/\.html$/, "")].includes(finalUrl.pathname)) return false;
    return type.includes("text/html") && (await response.clone().text()).includes('name="waypoint-shell" content="1"');
  }
  if (response.redirected) return false;
  if (/\.(m?js)$/.test(path)) return /javascript/.test(type);
  if (path.endsWith(".css")) return type.includes("text/css");
  return type.includes("image/svg+xml");
}
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("waypoint-shell-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== "GET") return;
  // Never cache APIs, sign-in/out responses, identity, or authenticated HTML.
  if (event.request.mode === "navigate" && (url.pathname === "/" || url.pathname === "/offline.html")) {
    // Keep the cached shell reachable when an online navigation would instead
    // show an expired-session gate. The shell contains no private trip data.
    event.respondWith(fetch(event.request).then(async response => {
      const html = response.headers.get("Content-Type")?.includes("text/html") ? await response.clone().text() : "";
      const gate = response.status === 401 || response.redirected || /<title>Sign in required/i.test(html);
      return gate ? (await caches.match("/offline.html", { ignoreVary: true })) || response : response;
    }).catch(() => caches.match("/offline.html", { ignoreVary: true }).then(r => r || Response.error())));
  } else if (ASSETS.includes(url.pathname)) {
    event.respondWith(fetch(event.request).then(async response => await validAsset(url.pathname, response) ? response : (await caches.match(url.pathname, { ignoreVary: true })) || Response.error()).catch(() => caches.match(url.pathname, { ignoreVary: true }).then(r => r || Response.error())));
  }
});
