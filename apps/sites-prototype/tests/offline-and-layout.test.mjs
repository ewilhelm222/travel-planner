import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createSampleTrip } from "../lib/prototype.mjs";
import { buildOfflineHtml } from "../public/offline-export.mjs";
import { responsePolicy } from "../public/reading-copy.mjs";
import { deriveBoard, sampleParallelTrip, previewStayShift } from "../public/parallel-layout.mjs";

test("saved HTML contains the complete itinerary and needs no network or scripts", () => {
  const trip = createSampleTrip();
  trip.activities[0].notes = "第一行\nSecond line";
  trip.places = [{ id: "p1", name: "Sample place", localName: "示例地点", address: "English address", localAddress: "中文地址" }];
  trip.activities[0].placeId = "p1";
  const html = buildOfflineHtml({ trip, revision: 7 }, { downloadedAt: "2026-11-10T20:00:00Z", exportedAt: "2026-11-10T21:00:00Z" });
  assert.match(html, /Revision 7/);
  assert.match(html, /2026-11-10T20:00:00Z/);
  assert.match(html, /第一行\nSecond line/);
  assert.match(html, /中文地址/);
  for (const a of trip.activities) assert.ok(html.includes(a.title.replaceAll("&", "&amp;")));
  for (const s of trip.stays) assert.ok(html.includes(s.lodging));
  assert.match(html, /Kyoto → Osaka/);
  assert.doesNotMatch(html, /<script|<link|<iframe|<img|\bsrc\s*=/i);
  assert.match(html, /default-src 'none'/);
});

test("offline HTML escapes untrusted notes and titles", () => {
  const trip = createSampleTrip();
  trip.title = '</title><script>alert("x")</script>';
  trip.activities[0].notes = '<img src="https://example.invalid/track" onerror="alert(1)">';
  const html = buildOfflineHtml({ trip, revision: 1 });
  assert.doesNotMatch(html, /<script|<img/i);
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;\/title&gt;/);
  assert.throws(() => buildOfflineHtml(null), /Download an itinerary/);
});

test("session expiry preserves the reading copy; access denial clears it", () => {
  assert.deepEqual(responsePolicy(401, "application/json").clearCopy, false);
  assert.deepEqual(responsePolicy(401, "application/json").needsSignIn, true);
  assert.equal(responsePolicy(200, "text/html").clearCopy, false);
  assert.equal(responsePolicy(403, "text/html").clearCopy, true);
  assert.equal(responsePolicy(503, "text/html"), null);
  assert.equal(responsePolicy(409, "application/json"), null);
});

test("actual client retains an expired-session copy until explicit sign-out", async () => {
  let script = await readFile(new URL("../public/planner.js", import.meta.url), "utf8");
  for (const file of ["reading-copy.mjs", "offline-export.mjs", "board.mjs", "participants.mjs"]) script = script.replaceAll(`import("/${file}")`, `import(${JSON.stringify(new URL(`../public/${file}`, import.meta.url).href)})`).replaceAll(`import('/${file}')`, `import(${JSON.stringify(new URL(`../public/${file}`, import.meta.url).href)})`);
  const key = "waypoint-downloaded-trip-v1";
  const snapshot = { trip: createSampleTrip(), revision: 4 };
  const storage = new Map([[key, JSON.stringify({ user: { id: "first-user", name: "Sample traveler" }, snapshot, downloadedAt: "2026-11-10T20:00:00Z" })]]);
  const elements = new Map(), events = new Map();
  let confirmExpired;
  const expired = new Promise(resolve => { confirmExpired = resolve; });
  const element = selector => {
    if (!elements.has(selector)) {
      const node = { innerHTML: "", disabled: false };
      Object.defineProperty(node, "textContent", { set(value) { if (selector === "#message" && value.includes("Sign-in needs refreshing")) confirmExpired(); } });
      elements.set(selector, node);
    }
    return elements.get(selector);
  };
  const document = { querySelector: element, addEventListener: (event, handler) => events.set(event, handler) };
  const localStorage = { getItem: name => storage.get(name), setItem: (name, value) => storage.set(name, value), removeItem: name => storage.delete(name) };
  let destination;
  const execute = new Function("document", "navigator", "window", "localStorage", "fetch", "location", `return ${script}`);
  await execute(document, { onLine: true }, { addEventListener() {} }, localStorage,
    async () => new Response('{"error":"expired"}', { status: 401, headers: { "Content-Type": "application/json" } }),
    { origin: "https://planner.test", assign: path => { destination = path; } });
  await expired;
  assert.ok(storage.has(key), "Expired auth must not erase the downloaded trip.");
  assert.match(element("#status").innerHTML, /Sign-in expired · reading only/);
  assert.match(element("#app").innerHTML, /Sign in to update/);
  await events.get("click")({ target: { closest: () => ({ id: "sign-out", dataset: {}, disabled: false }) } });
  assert.equal(storage.has(key), false, "Explicit sign-out still erases the reading copy.");
  assert.equal(destination, "/signout-with-chatgpt?return_to=%2F");
});

test("parallel board derives one shared event independently of lodging", () => {
  const trip = sampleParallelTrip();
  assert.ok(trip.activities.every(a => !("stayId" in a)));
  const day = deriveBoard(trip).find(d => d.date === "2027-04-13");
  const dinner = day.cities.flatMap(c => c.activities).filter(a => a.id === "shared-dinner");
  assert.equal(dinner.length, 1);
  const birch = deriveBoard(trip, "birch").find(d => d.date === "2027-04-13");
  assert.ok(birch.cities.find(c => c.id === "osaka").staying.includes("birch"));
  assert.ok(birch.cities.find(c => c.id === "kyoto").activities.some(a => a.id === "shared-dinner"));
  assert.ok(!birch.cities.flatMap(c => c.activities).some(a => a.id === "solo-garden"));
});

test("stay preview separates solo moves, shared decisions, and fixed bookings", () => {
  const trip = sampleParallelTrip(), before = structuredClone(trip);
  const preview = previewStayShift(trip, "cedar-kyoto", 1);
  assert.deepEqual(preview.shift.find(a => a.id === "solo-garden"), { id: "solo-garden", date: "2027-04-14" });
  assert.ok(preview.fixed.includes("shared-dinner"));
  assert.ok(preview.mixed.includes("shared-walk"));
  assert.ok(!preview.shift.some(a => ["museum", "birch-arrival"].includes(a.id)));
  assert.deepEqual(trip, before, "A preview must not mutate anyone's plan.");
});

test("offline worker handles an expired-session page and refuses HTML masquerading as code", async () => {
  const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  const handlers = new Map(), savedShell = new Response("cached offline shell", { headers: { "Content-Type": "text/html" } });
  const context = { self: { location: { origin: "https://planner.test" }, addEventListener: (name, handler) => handlers.set(name, handler) },
    caches: { match: async (path, options) => {
      assert.equal(options?.ignoreVary, true, "Static cache lookup must survive module requests with a different Origin header.");
      return (typeof path === "string" ? path : path.url).includes("offline.html") ? savedShell.clone() : new Response("cached script", { headers: { "Content-Type": "text/javascript" } });
    } },
    URL, Response, fetch: async () => new Response("<title>Sign in required</title>", { headers: { "Content-Type": "text/html" } }) };
  vm.runInNewContext(source, context);
  let pending;
  handlers.get("fetch")({ request: { url: "https://planner.test/", method: "GET", mode: "navigate" }, respondWith: result => { pending = result; } });
  assert.equal(await (await pending).text(), "cached offline shell");
  handlers.get("fetch")({ request: { url: "https://planner.test/reading-copy.mjs", method: "GET", mode: "same-origin" }, respondWith: result => { pending = result; } });
  assert.equal(await (await pending).text(), "cached script");
  pending = null;
  handlers.get("fetch")({ request: { url: "https://planner.test/api/trip", method: "GET", mode: "same-origin" }, respondWith: result => { pending = result; } });
  assert.equal(pending, null, "Private API responses must never be served from the offline cache.");
});

test("offline installation accepts only the known clean-URL shell redirect", async () => {
  const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  async function install(shellUrl, shellBody) {
    const handlers = new Map(), stored = new Map();
    const context = { self: { location: { origin: "https://planner.test" }, addEventListener: (name, handler) => handlers.set(name, handler), skipWaiting() {}, clients: { matchAll: async () => [] } },
      caches: { open: async () => ({ put: async (path, response) => stored.set(path, await response.text()) }) }, URL,
      fetch: async path => {
        if (path === "/offline.html") {
          const response = new Response(shellBody, { headers: { "Content-Type": "text/html" } });
          Object.defineProperty(response, "url", { value: shellUrl });
          Object.defineProperty(response, "redirected", { value: true });
          return response;
        }
        const type = path.endsWith(".css") ? "text/css" : path.endsWith(".svg") ? "image/svg+xml" : "text/javascript";
        return new Response("static asset", { headers: { "Content-Type": type } });
      } };
    vm.runInNewContext(source, context);
    let pending;
    handlers.get("install")({ waitUntil: promise => { pending = promise; } });
    await pending;
    return stored;
  }
  const marker = '<meta name="waypoint-shell" content="1">';
  const cached = await install("https://planner.test/offline", marker);
  assert.equal(cached.size, 8);
  assert.equal(cached.get("/offline.html"), marker);
  await assert.rejects(install("https://planner.test/signin-with-chatgpt", marker), /Offline assets unavailable/);
  await assert.rejects(install("https://planner.test/offline", "<title>Sign in required</title>"), /Offline assets unavailable/);
});
