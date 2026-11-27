// Afiax Provider service worker. It makes the app installable (its own window and icon). It caches
// nothing yet: every request goes to the network, so nobody sees stale clinical data. The offline
// app shell comes later, with its own rules for what may be cached.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  // No respondWith: the browser fetches as usual
});
