// JalNetra service worker: makes the app installable and shows a friendly page when offline.
// Pages and data always come from the network, so engineers never see stale checks.
const OFFLINE_HTML = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>JalNetra – offline</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#EEF1F7;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1C1C1E;text-align:center;padding:24px}
.c{background:#fff;border-radius:24px;padding:32px;max-width:360px;box-shadow:0 8px 32px rgba(31,41,79,.08)}h1{font-size:22px;margin:0 0 8px}p{color:#8E8E93;margin:0 0 20px;line-height:1.4}
button{background:#007AFF;color:#fff;border:0;border-radius:999px;padding:12px 24px;font-size:16px;font-weight:600}</style></head>
<body><div class="c"><h1>You're offline</h1><p>JalNetra needs an internet connection to load and save checks. Connect and try again.</p><button onclick="location.reload()">Try again</button></div></body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return; // everything else: normal network
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});
