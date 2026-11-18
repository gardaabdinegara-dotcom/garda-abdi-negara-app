const offlinePage = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>Ruang Garda</title>
</head>
<body>
  <main>
    <h1>Koneksi terputus</h1>
    <p>Sambungkan perangkat ke internet untuk membuka Ruang Garda.</p>
    <a href="">Coba lagi</a>
  </main>
</body>
</html>`;

self.addEventListener("install", (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  // Halaman akun dan hasil permintaan tetap diambil dari server tanpa cache service worker.
  const { request } = event;
  if (request.mode !== "navigate" || request.method !== "GET") return;
  event.respondWith(fetch(request).catch(() => new Response(offlinePage, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  })));
});
