// Minimal service worker so the app can be installed and appear in the Share menu.
// Pages always come from the network; if you're offline you get a short notice.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(
      () =>
        new Response(
          '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><body style="font:17px system-ui;padding:2rem"><h1>You’re offline</h1><p>Your research library needs a connection. Try again when you’re back online.</p></body>',
          { headers: { 'content-type': 'text/html; charset=utf-8' } }
        )
    )
  );
});
