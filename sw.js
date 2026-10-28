/* 어닝톡 푸시 알림 (홈 화면 아이콘으로 쓰는 사람만) — 새 메시지 알림 + 아이콘 숫자 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch(_) { d = {body: e.data ? e.data.text() : ''}; }
  e.waitUntil((async () => {
    await self.registration.showNotification(d.title || '어닝톡', {
      body: d.body || '새 메시지가 왔어요', tag: d.tag || 'talk', renotify: true,
      icon: '/talk-192.png', badge: '/talk-192.png', data: {url: d.url || '/'}
    });
    try { const n = (await self.registration.getNotifications()).length; if (self.navigator.setAppBadge) await self.navigator.setAppBadge(n); } catch(_) {}
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    for (const c of all) { if ('focus' in c) { try { await c.navigate(url); } catch(_) {} return c.focus(); } }
    return self.clients.openWindow(url);
  })());
});
