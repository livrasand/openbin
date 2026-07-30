self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { message: event.data.text(), title: 'Openbin Space' };
  }

  const title = payload.title || `Openbin /${payload.space}`;
  const body = payload.message || 'New message';
  const tag = payload.space ? `openbin-space-${payload.space}` : 'openbin-space';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: payload,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const payload = event.notification.data || {};
  const space = payload.space;
  if (space) {
    event.waitUntil(
      self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          const url = new URL(`/spaces/${space}`, self.location.origin).href;
          for (const client of clientList) {
            if (client.url === url && 'focus' in client) {
              return client.focus();
            }
          }
          if (self.clients.openWindow) {
            return self.clients.openWindow(url);
          }
        })
    );
  }
});
