self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) {}
  const title = payload.title || "Penubaka Village Update";
  const options = {
    body: payload.body || "A new village announcement is available. Tap to read more.",
    icon: payload.icon || "/assets/Penubaka Village Pride Map.png",
    badge: payload.badge || "/assets/Penubaka Village Pride Map.png",
    image: payload.image || undefined,
    timestamp: payload.timestamp || Date.now(),
    vibrate: [120, 60, 120],
    data: { url: payload.url || "/announcements.html" },
    tag: payload.tag || "penubaka-village-update",
    renotify: false
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/announcements.html", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.location.origin) && "focus" in client) {
        await client.focus();
        if ("navigate" in client) await client.navigate(target);
        return;
      }
    }
    await clients.openWindow(target);
  })());
});