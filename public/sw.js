// Network-only app shell. Do not cache application records, credentials or scripts.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>출입신청</title><body style="font-family:sans-serif;padding:32px;line-height:1.8"><h1>인터넷 연결을 확인해 주세요</h1><p>출입신청은 인터넷에 연결된 상태에서 이용할 수 있습니다.</p><a href="/">다시 열기</a></body></html>',
    {status:503, headers:{'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store'}}
  )));
});
