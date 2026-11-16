// Minimal service worker: gør appen installérbar. Cacher bevidst ikke noget,
// så gæster altid får nyeste version og aldrig forældede data.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
