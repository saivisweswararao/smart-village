self.addEventListener("install", function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", function (event) {
  var payload = {};
  try {
    if (event.data) {
      var raw = event.data.text();
      try { payload = JSON.parse(raw); }
      catch (_) { payload = { body: raw }; }
    }
  } catch (_) {}

  var title = payload.title || "Penubaka Village Update";
  var options = {
    body: payload.body || "A new village announcement is available. Tap to read more.",
    icon: payload.icon || "/assets/Penubaka%20Village%20Pride%20Map.png",
    badge: payload.badge || "/assets/Penubaka%20Village%20Pride%20Map.png",
    timestamp: payload.timestamp || Date.now(),
    data: { url: payload.url || "/announcements.html" },
    tag: payload.tag || "penubaka-village-update",
    renotify: false
  };

  // Images and vibration are optional browser features; omit them for
  // maximum compatibility, especially with iOS Home Screen web apps.
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var requested = event.notification.data && event.notification.data.url
    ? event.notification.data.url : "/announcements.html";
  var target;
  try {
    target = new URL(requested, self.location.origin);
    if (target.origin !== self.location.origin) target = new URL("/announcements.html", self.location.origin);
  } catch (_) {
    target = new URL("/announcements.html", self.location.origin);
  }

  event.waitUntil((async function () {
    var windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (var i = 0; i < windows.length; i++) {
      var client = windows[i];
      if (client.url.indexOf(self.location.origin) === 0 && "focus" in client) {
        await client.focus();
        if ("navigate" in client) await client.navigate(target.href);
        return;
      }
    }
    await self.clients.openWindow(target.href);
  })());
});
